// Mode B end to end through HTTP, with fake market-data providers (test-only; never production data).
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { SimulateModeBResponse } from '@mindspark/shared';
import { buildConfig } from '../../src/config/index.js';
import { parseEnv } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { createMarketDataService } from '../../src/services/market-data/marketDataService.js';
import {
  MarketDataError,
  type FxRateProvider,
  type LiveLevelProvider,
} from '../../src/services/market-data/types.js';
import { AppError } from '../../src/utils/errors.js';
import { silentLogger } from '../../src/utils/logger.js';
import { errorBody } from '../helpers/http.js';

const config = buildConfig(parseEnv({}));

const live: LiveLevelProvider = {
  getLevel: (symbol) =>
    symbol === '^NSEI'
      ? Promise.resolve({ value: 25_000, source: 'live', asOf: '2026-10-05T04:15:00.000Z' })
      : Promise.reject(new AppError('VALIDATION_ERROR', 'no live feed for this symbol')),
};
const fx: FxRateProvider = {
  getRate: () => Promise.resolve({ value: 80, source: 'reference', asOf: '2026-10-02' }),
};
const staleLive: LiveLevelProvider = {
  getLevel: () => Promise.reject(new MarketDataError('Live level for ^NSEI is stale')),
};

const appWith = (deps: Parameters<typeof createMarketDataService>[0]) =>
  createApp(config, silentLogger, { marketData: createMarketDataService(deps) });
const app = appWith({ live, fx });

const post = (body: unknown, target = app) =>
  request(target)
    .post('/api/simulate')
    .send(body as object);
const out = (res: { body: unknown }) => res.body as SimulateModeBResponse;

const underlying = { symbol: '^NSEI', assetClass: 'index' };
const eln = {
  underlying,
  notional: 1_000_000,
  tenorDays: 365,
  strikePct: 100,
  couponPct: 10,
  barrierPct: 80,
  barrierType: 'European',
};
const dcd = {
  depositCurrency: 'USD',
  alternateCurrency: 'INR',
  depositAmount: 100_000,
  tenorDays: 90,
  strikeRate: 84,
  enhancedRatePct: 8,
};
const cpn = {
  underlying,
  notional: 1_000_000,
  tenorDays: 1095,
  protectionPct: 100,
  participationPct: 60,
};
const manual = { source: 'manual', value: 25_000 } as const;
const base = { mode: 'B', level: manual } as const;

describe('POST /api/simulate — Mode B results', () => {
  it('ELN above the barrier: coupon only, no knock-in', async () => {
    const res = await post({ ...base, productType: 'ELN', terms: eln, shockPct: -10 });
    expect(res.status).toBe(200);
    const body = out(res);
    expect(body.level).toEqual({ value: 25_000, source: 'manual', asOf: null });
    expect(body.shock.pct).toBe(-10);
    expect(body.shock.shockedLevel).toBeCloseTo(22_500, 9);
    expect(body.result.payoff).toBeCloseTo(1_100_000, 6);
    expect(body.result.returnPct).toBeCloseTo(10, 9);
    expect(body.result.lossAmount).toBe(0);
    expect(body.result.knockedIn).toBe(false);
  });

  it('ELN below the barrier: knocked in, principal loss', async () => {
    const body = out(await post({ ...base, productType: 'ELN', terms: eln, shockPct: -25 }));
    expect(body.result.knockedIn).toBe(true);
    expect(body.result.payoff).toBeCloseTo(850_000, 6);
    expect(body.result.returnPct).toBeCloseTo(-15, 9);
    expect(body.result.lossAmount).toBeCloseTo(150_000, 6);
  });

  it('ELN shocked exactly onto the barrier: touching counts as knock-in', async () => {
    const body = out(await post({ ...base, productType: 'ELN', terms: eln, shockPct: -20 }));
    expect(body.result.knockedIn).toBe(true);
    expect(body.result.payoff).toBeCloseTo(900_000, 6);
  });

  it('ELN American barrier in Mode B tests the shocked level (settled convention)', async () => {
    const terms = { ...eln, barrierType: 'American' };
    const body = out(await post({ ...base, productType: 'ELN', terms, shockPct: -21 }));
    expect(body.result.knockedIn).toBe(true);
  });

  it('plain ELN has no knock-in flag but still loses principal below the strike', async () => {
    const { barrierPct: _p, barrierType: _t, ...plain } = eln;
    const body = out(await post({ ...base, productType: 'ELN', terms: plain, shockPct: -25 }));
    expect(body.result.knockedIn).toBeNull();
    expect(body.result.payoff).toBeCloseTo(850_000, 6);
  });

  it('CPN: participation on the upside, protection on the downside', async () => {
    const up = out(await post({ ...base, productType: 'CPN', terms: cpn, shockPct: 20 }));
    expect(up.result.payoff).toBeCloseTo(1_120_000, 6);
    expect(up.result.returnPct).toBeCloseTo(12, 9);
    const down = out(await post({ ...base, productType: 'CPN', terms: cpn, shockPct: -30 }));
    expect(down.result.payoff).toBeCloseTo(1_000_000, 6);
    expect(down.result.lossAmount).toBe(0);
  });

  it('DCD: shock moves the FX rate; above the strike it converts at K', async () => {
    const body = out(
      await post({
        mode: 'B',
        productType: 'DCD',
        terms: dcd,
        shockPct: 10,
        level: { source: 'manual', value: 80 },
      }),
    );
    const due = 100_000 * (1 + (0.08 * 90) / 365);
    expect(body.shock.shockedLevel).toBeCloseTo(88, 9);
    expect(body.result.payoff).toBeCloseTo((due * 84) / 88, 6);
    expect(body.result.details).toMatchObject({ converted: true, settlementCurrency: 'INR' });
    expect(body.result.knockedIn).toBeNull();
    expect(body.result.returnPct).toBeCloseTo(((due * 84) / 88 / 100_000 - 1) * 100, 9);
  });

  it('DCD with the FX reference rate reports its source and date', async () => {
    const body = out(
      await post({
        mode: 'B',
        productType: 'DCD',
        terms: dcd,
        shockPct: 0,
        level: { source: 'reference' },
      }),
    );
    expect(body.level).toEqual({ value: 80, source: 'reference', asOf: '2026-10-02' });
    expect(body.result.details).toMatchObject({ converted: false });
  });
});

describe('POST /api/simulate — live level', () => {
  it('uses the live provider and reports its timestamp', async () => {
    const res = await post({
      mode: 'B',
      productType: 'CPN',
      terms: cpn,
      shockPct: 20,
      level: { source: 'live' },
    });
    expect(res.status).toBe(200);
    expect(out(res).level).toEqual({
      value: 25_000,
      source: 'live',
      asOf: '2026-10-05T04:15:00.000Z',
    });
  });

  it('returns MARKET_DATA_UNAVAILABLE (503) when the live level is stale, with no fallback', async () => {
    const res = await post(
      { mode: 'B', productType: 'CPN', terms: cpn, shockPct: 0, level: { source: 'live' } },
      appWith({ live: staleLive, fx }),
    );
    expect(res.status).toBe(503);
    expect(errorBody(res).code).toBe('MARKET_DATA_UNAVAILABLE');
    expect(errorBody(res).message).toMatch(/stale/);
  });

  it('returns MARKET_DATA_UNAVAILABLE when no live feed is configured', async () => {
    const unconfigured = createApp(config, silentLogger);
    const res = await post(
      { mode: 'B', productType: 'CPN', terms: cpn, shockPct: 0, level: { source: 'live' } },
      unconfigured,
    );
    expect(res.status).toBe(503);
    expect(errorBody(res).code).toBe('MARKET_DATA_UNAVAILABLE');
    expect(errorBody(res).message).toMatch(/manually/);
  });

  it('returns 400 for a symbol with no live feed', async () => {
    const terms = { ...cpn, underlying: { symbol: 'TCS.NS', assetClass: 'equity' } };
    const res = await post({
      mode: 'B',
      productType: 'CPN',
      terms,
      shockPct: 0,
      level: { source: 'live' },
    });
    expect(res.status).toBe(400);
  });

  it('manual levels still work with no providers at all', async () => {
    const res = await post({ ...base, productType: 'CPN', terms: cpn, shockPct: 0 }, appWith({}));
    expect(res.status).toBe(200);
  });

  it('FX reference without an FX provider fails clearly', async () => {
    const res = await post(
      { mode: 'B', productType: 'DCD', terms: dcd, shockPct: 0, level: { source: 'reference' } },
      appWith({ live }),
    );
    expect(res.status).toBe(503);
    expect(errorBody(res).code).toBe('MARKET_DATA_UNAVAILABLE');
  });
});

describe('POST /api/simulate — validation', () => {
  const issuePaths = (res: { body: unknown }) => (errorBody(res).details ?? []).map((d) => d.path);
  const level = (l: object) => ({ mode: 'B', shockPct: 0, level: l });

  it('Mode A without a configured forecast service fails with AI_UNAVAILABLE', async () => {
    const res = await post({ mode: 'A', productType: 'ELN', terms: eln });
    expect(res.status).toBe(503);
    expect(errorBody(res).code).toBe('AI_UNAVAILABLE');
  });

  it.each([
    [
      'live level for DCD',
      { ...level({ source: 'live' }), productType: 'DCD', terms: dcd },
      'level.source',
    ],
    [
      'reference level for ELN',
      { ...level({ source: 'reference' }), productType: 'ELN', terms: eln },
      'level.source',
    ],
    ['shock of -100%', { ...base, productType: 'ELN', terms: eln, shockPct: -100 }, 'shockPct'],
    ['shock below -100%', { ...base, productType: 'ELN', terms: eln, shockPct: -150 }, 'shockPct'],
    ['missing shock', { ...base, productType: 'ELN', terms: eln }, 'shockPct'],
    ['non-numeric shock', { ...base, productType: 'ELN', terms: eln, shockPct: '10' }, 'shockPct'],
    [
      'zero manual level',
      { ...level({ source: 'manual', value: 0 }), productType: 'ELN', terms: eln },
      'level.value',
    ],
    [
      'manual level without value',
      { ...level({ source: 'manual' }), productType: 'ELN', terms: eln },
      'level.value',
    ],
    [
      'unknown level source',
      { ...level({ source: 'yahoo' }), productType: 'ELN', terms: eln },
      'level.source',
    ],
    [
      'invalid terms',
      { ...base, productType: 'ELN', terms: { ...eln, barrierPct: 120 }, shockPct: 0 },
      'terms.barrierPct',
    ],
    ['unknown field', { ...base, productType: 'ELN', terms: eln, shockPct: 0, extra: 1 }, ''],
  ])('rejects %s', async (_name, payload, path) => {
    const res = await post(payload);
    expect(res.status).toBe(400);
    expect(errorBody(res).code).toBe('VALIDATION_ERROR');
    if (path) expect(issuePaths(res)).toContain(path);
  });

  it('rejects an empty body and an unknown product', async () => {
    expect((await request(app).post('/api/simulate')).status).toBe(400);
    expect((await post({ ...base, productType: 'FCN', terms: {}, shockPct: 0 })).status).toBe(400);
  });
});
