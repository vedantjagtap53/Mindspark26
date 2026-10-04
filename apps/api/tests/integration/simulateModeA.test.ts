// Mode A end to end through HTTP with a fake forecast client (contract fixture; test-only data).
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  PAYOFF_CURVE_SHOCKS,
  SCENARIO_SHOCKS,
  type ForecastRequestInput,
  type SimulateModeAResponse,
} from '@mindspark/shared';
import { buildConfig } from '../../src/config/index.js';
import { parseEnv } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { ForecastError, type ForecastClient } from '../../src/services/ai/forecastClient.js';
import { createMarketDataService } from '../../src/services/market-data/marketDataService.js';
import { silentLogger } from '../../src/utils/logger.js';
import { makeForecast } from '../fixtures/forecast.js';
import { errorBody } from '../helpers/http.js';

const SPOT = 25_000;
const N = 1_000_000;
const config = buildConfig(parseEnv({}));

function fakeForecast(fail?: ForecastError) {
  const calls: ForecastRequestInput[] = [];
  const client: ForecastClient = {
    forecast: (input) => {
      calls.push(input);
      if (fail) return Promise.reject(fail);
      return Promise.resolve(
        makeForecast({
          spot: SPOT,
          tenorDays: input.tenorDays,
          samplePathCount: input.samplePathCount,
        }),
      );
    },
  };
  return { client, calls };
}

const appWith = (forecast?: ForecastClient) =>
  createApp(config, silentLogger, { marketData: createMarketDataService({}), forecast });
const post = (body: object, app = appWith(fakeForecast().client)) =>
  request(app).post('/api/simulate').send(body);
const out = (res: { body: unknown }) => res.body as SimulateModeAResponse;

const underlying = { symbol: '^NSEI', assetClass: 'index' };
const eln = {
  underlying,
  notional: N,
  tenorDays: 182,
  strikePct: 100,
  couponPct: 10,
  barrierPct: 80,
  barrierType: 'European',
};
const cpn = { underlying, notional: N, tenorDays: 182, protectionPct: 100, participationPct: 60 };
const coupon = N * 0.1 * (182 / 365);

describe('POST /api/simulate — Mode A', () => {
  it('asks the forecast service for the product underlying, tenor and window', async () => {
    const { client, calls } = fakeForecast();
    await post(
      { mode: 'A', productType: 'ELN', terms: eln, trainingWindowYears: 5 },
      appWith(client),
    );
    expect(calls).toEqual([
      { underlying, tenorDays: 182, trainingWindowYears: 5, samplePathCount: 500 },
    ]);
  });

  it('defaults the training window to 10 years', async () => {
    const { client, calls } = fakeForecast();
    await post({ mode: 'A', productType: 'CPN', terms: cpn }, appWith(client));
    expect(calls[0]?.trainingWindowYears).toBe(10);
  });

  it('ELN: runs the engine on each case path', async () => {
    const res = await post({ mode: 'A', productType: 'ELN', terms: eln });
    expect(res.status).toBe(200);
    const body = out(res);
    expect(body.spot).toEqual({ value: SPOT, asOf: '2026-10-02' });
    expect(body.horizon).toEqual({ tenorDays: 182, tradingDays: 126 });
    // Fixture cases end at 85% / 104% / 122% of spot: all above the 80% barrier.
    for (const k of ['low', 'base', 'high'] as const) {
      expect(body.cases[k].knockedIn).toBe(false);
      expect(body.cases[k].payoff).toBeCloseTo(N + coupon, 6);
    }
    expect(body.cases.low.terminal).toBeCloseTo(SPOT * 0.85, 6);
    expect(body.cases.low.percentile).toBe(5);
    expect(body.cases.low.returnPct).toBeCloseTo((coupon / N) * 100, 9);
  });

  it('ELN American barrier: a case path touching the barrier knocks in', async () => {
    const terms = { ...eln, barrierPct: 85, barrierType: 'American' };
    const body = out(await post({ mode: 'A', productType: 'ELN', terms }));
    expect(body.cases.low.knockedIn).toBe(true);
    expect(body.cases.low.payoff).toBeCloseTo(N * 0.85 + coupon, 4);
    expect(body.cases.low.lossAmount).toBeCloseTo(N - (N * 0.85 + coupon), 4);
    expect(body.cases.base.knockedIn).toBe(false);
  });

  it('ELN distribution: knock-in and loss probabilities across the sample paths', async () => {
    const body = out(await post({ mode: 'A', productType: 'ELN', terms: eln }));
    // Fixture: 500 straight paths ending at 70% … 130% of spot.
    const ends = Array.from({ length: 500 }, (_, i) => 0.7 + (0.6 * i) / 499);
    const knocked = ends.filter((e) => e <= 0.8 + 1e-12).length;
    const losses = ends.filter((e) => e <= 0.8 + 1e-12 && N * e + coupon < N).length;
    expect(body.distribution.pathCount).toBe(500);
    expect(body.distribution.probabilityOfKnockIn).toBeCloseTo(knocked / 500, 12);
    expect(body.distribution.probabilityOfLoss).toBeCloseTo(losses / 500, 12);
    expect(body.distribution.payoffQuantiles.p50).toBeCloseTo(N + coupon, 4);
  });

  it('CPN: no barrier, so knock-in fields are null', async () => {
    const body = out(await post({ mode: 'A', productType: 'CPN', terms: cpn }));
    expect(body.cases.high.payoff).toBeCloseTo(N * (1 + 0.6 * 0.22), 4);
    expect(body.cases.low.payoff).toBeCloseTo(N, 6);
    expect(body.cases.low.knockedIn).toBeNull();
    expect(body.distribution.probabilityOfKnockIn).toBeNull();
    expect(body.distribution.probabilityOfLoss).toBe(0);
  });

  it('returns the fan chart, model card and backtest, and the scenario notice', async () => {
    const body = out(await post({ mode: 'A', productType: 'CPN', terms: cpn }));
    expect(body.fan.p50).toHaveLength(127);
    expect(body.fan.p50[0]).toBe(SPOT);
    expect(body.model).toMatchObject({
      name: 'garch11-t-montecarlo',
      simulations: 10000,
      trainingWindowYears: 10,
      trainingStart: '2016-10-03',
      trainingEnd: '2026-10-02',
    });
    expect(body.backtest.bandCoverage).toBe(0.88);
    expect(body.notice).toMatch(/not a guarantee/);
    expect(body).not.toHaveProperty('samplePaths');
  });

  it('returns the payoff curve, the PRD scenario table and breakevens from the spot', async () => {
    const body = out(await post({ mode: 'A', productType: 'ELN', terms: eln }));
    expect(body.curve.map((p) => p.shockPct)).toEqual([...PAYOFF_CURVE_SHOCKS]);
    expect(body.scenarios.map((p) => p.shockPct)).toEqual([...SCENARIO_SHOCKS]);
    // Levels are the spot shocked; −25% is below the 80% barrier (knocked in), 0% is not.
    const at = (s: number) => body.scenarios.find((p) => p.shockPct === s)!;
    expect(at(0).level).toBeCloseTo(SPOT, 6);
    expect(at(-25).level).toBeCloseTo(SPOT * 0.75, 6);
    expect(at(-25).knockedIn).toBe(true);
    expect(at(0).knockedIn).toBe(false);
    expect(at(0).payoff).toBeCloseTo(N + coupon, 4);
    // The breakeven of a barrier ELN is the barrier cliff at −20%.
    expect(body.breakevens).toHaveLength(1);
    expect(body.breakevens[0]!.shockPct).toBeCloseTo(-20, 3);
    expect(body.breakevens[0]!.level).toBeCloseTo(SPOT * 0.8, 1);
  });

  it('a fully protected CPN has no breakeven (it never loses)', async () => {
    const body = out(await post({ mode: 'A', productType: 'CPN', terms: cpn }));
    expect(body.breakevens).toEqual([]);
  });
});

describe('POST /api/simulate — Mode A errors', () => {
  it('forecast service not configured → AI_UNAVAILABLE (503)', async () => {
    const res = await post({ mode: 'A', productType: 'ELN', terms: eln }, appWith(undefined));
    expect(res.status).toBe(503);
    expect(errorBody(res).code).toBe('AI_UNAVAILABLE');
  });

  it('forecast service down → AI_UNAVAILABLE (503)', async () => {
    const { client } = fakeForecast(
      new ForecastError('AI_UNAVAILABLE', 'Forecast service is unreachable'),
    );
    const res = await post({ mode: 'A', productType: 'ELN', terms: eln }, appWith(client));
    expect(res.status).toBe(503);
    expect(errorBody(res).message).toMatch(/unreachable/);
  });

  it('forecast breaks the contract → AI_INVALID_RESPONSE (502) with details, no fallback', async () => {
    const { client } = fakeForecast(
      new ForecastError('AI_INVALID_RESPONSE', 'Forecast response does not match the contract', [
        { path: 'data', message: 'Required' },
      ]),
    );
    const res = await post({ mode: 'A', productType: 'ELN', terms: eln }, appWith(client));
    expect(res.status).toBe(502);
    expect(errorBody(res)).toMatchObject({
      code: 'AI_INVALID_RESPONSE',
      details: [{ path: 'data', message: 'Required' }],
    });
  });

  it('DCD has no Mode A yet → NOT_IMPLEMENTED (501)', async () => {
    const terms = {
      depositCurrency: 'USD',
      alternateCurrency: 'INR',
      depositAmount: 100_000,
      tenorDays: 90,
      strikeRate: 84,
      enhancedRatePct: 8,
    };
    const res = await post({ mode: 'A', productType: 'DCD', terms });
    expect(res.status).toBe(501);
    expect(errorBody(res).code).toBe('NOT_IMPLEMENTED');
  });

  it.each([
    ['an invalid training window', { trainingWindowYears: 7 }],
    ['a Mode B shock', { shockPct: -10 }],
    ['a Mode B level', { level: { source: 'manual', value: 25_000 } }],
  ])('rejects %s', async (_name, extra) => {
    const res = await post({ mode: 'A', productType: 'ELN', terms: eln, ...extra });
    expect(res.status).toBe(400);
    expect(errorBody(res).code).toBe('VALIDATION_ERROR');
  });

  it('rejects a tenor outside 30–1,095 days before calling the forecast service', async () => {
    const { client, calls } = fakeForecast();
    const res = await post(
      { mode: 'A', productType: 'ELN', terms: { ...eln, tenorDays: 20 } },
      appWith(client),
    );
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
