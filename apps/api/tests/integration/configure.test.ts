import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { ConfigureResponse } from '@mindspark/shared';
import { buildConfig } from '../../src/config/index.js';
import { parseEnv } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { silentLogger } from '../../src/utils/logger.js';
import { errorBody } from '../helpers/http.js';

const app = createApp(buildConfig(parseEnv({})), silentLogger);
const post = (body: unknown) =>
  request(app)
    .post('/api/configure')
    .send(body as object);
const result = (res: { body: unknown }) => res.body as ConfigureResponse;

const underlying = { symbol: '^NSEI', assetClass: 'index' };
const eln = {
  underlying,
  notional: 1_000_000,
  tenorDays: 182,
  strikePct: 100,
  couponPct: 12,
  barrierPct: 70,
  barrierType: 'American',
};
const dcd = {
  depositCurrency: 'usd',
  alternateCurrency: 'INR',
  depositAmount: 100_000,
  tenorDays: 90,
  strikeRate: 84,
  enhancedRatePct: 8,
};
const cpn = {
  underlying,
  notional: 500_000,
  tenorDays: 365,
  protectionPct: 100,
  participationPct: 60,
};

function issuePaths(res: { body: unknown }): string[] {
  return (errorBody(res).details ?? []).map((d) => d.path);
}

describe('POST /api/configure', () => {
  it('normalizes a barrier ELN and derives variant and tenor in years', async () => {
    const res = await post({ productType: 'ELN', terms: eln });
    expect(res.status).toBe(200);
    expect(result(res)).toEqual({
      productType: 'ELN',
      terms: eln,
      derived: { variant: 'barrier', tenorYears: 182 / 365 },
    });
  });

  it('treats an ELN without barrier fields as plain', async () => {
    const { barrierPct: _p, barrierType: _t, ...plain } = eln;
    const res = await post({ productType: 'ELN', terms: plain });
    expect(res.status).toBe(200);
    expect(result(res)).toMatchObject({ derived: { variant: 'plain' } });
  });

  it('upper-cases DCD currency codes', async () => {
    const res = await post({ productType: 'DCD', terms: dcd });
    expect(res.status).toBe(200);
    expect(result(res)).toMatchObject({
      productType: 'DCD',
      terms: { depositCurrency: 'USD', alternateCurrency: 'INR' },
      derived: { tenorYears: 90 / 365 },
    });
  });

  it('accepts a CPN with and without a cap', async () => {
    expect((await post({ productType: 'CPN', terms: cpn })).status).toBe(200);
    expect((await post({ productType: 'CPN', terms: { ...cpn, capPct: 25 } })).status).toBe(200);
  });

  it.each([
    ['tenor below 30 days', { ...eln, tenorDays: 29 }, 'terms.tenorDays'],
    ['tenor above 1,095 days', { ...eln, tenorDays: 1096 }, 'terms.tenorDays'],
    ['non-integer tenor', { ...eln, tenorDays: 90.5 }, 'terms.tenorDays'],
    ['zero notional', { ...eln, notional: 0 }, 'terms.notional'],
    ['negative notional', { ...eln, notional: -5 }, 'terms.notional'],
    ['barrier equal to strike', { ...eln, barrierPct: 100 }, 'terms.barrierPct'],
    ['barrier above strike', { ...eln, barrierPct: 110 }, 'terms.barrierPct'],
    ['unknown barrier type', { ...eln, barrierType: 'Asian' }, 'terms.barrierType'],
    ['negative coupon', { ...eln, couponPct: -1 }, 'terms.couponPct'],
    ['unknown field', { ...eln, leverage: 3 }, 'terms'],
  ])('rejects ELN with %s', async (_name, terms, path) => {
    const res = await post({ productType: 'ELN', terms });
    expect(res.status).toBe(400);
    expect(errorBody(res).code).toBe('VALIDATION_ERROR');
    expect(issuePaths(res)).toContain(path);
  });

  it('requires barrier level and type together', async () => {
    const { barrierPct: _p, ...noLevel } = eln;
    const { barrierType: _t, ...noType } = eln;
    const a = await post({ productType: 'ELN', terms: noLevel });
    const b = await post({ productType: 'ELN', terms: noType });
    expect(a.status).toBe(400);
    expect(issuePaths(a)).toContain('terms.barrierPct');
    expect(b.status).toBe(400);
    expect(issuePaths(b)).toContain('terms.barrierType');
  });

  it.each([
    ['same currencies', { ...dcd, alternateCurrency: 'usd' }, 'terms.alternateCurrency'],
    ['bad currency code', { ...dcd, depositCurrency: 'DOLLAR' }, 'terms.depositCurrency'],
    ['zero deposit', { ...dcd, depositAmount: 0 }, 'terms.depositAmount'],
    ['zero strike rate', { ...dcd, strikeRate: 0 }, 'terms.strikeRate'],
    ['negative enhanced rate', { ...dcd, enhancedRatePct: -2 }, 'terms.enhancedRatePct'],
  ])('rejects DCD with %s', async (_name, terms, path) => {
    const res = await post({ productType: 'DCD', terms });
    expect(res.status).toBe(400);
    expect(issuePaths(res)).toContain(path);
  });

  it.each([
    ['protection above 100', { ...cpn, protectionPct: 101 }, 'terms.protectionPct'],
    ['negative protection', { ...cpn, protectionPct: -1 }, 'terms.protectionPct'],
    ['zero participation', { ...cpn, participationPct: 0 }, 'terms.participationPct'],
    ['zero cap', { ...cpn, capPct: 0 }, 'terms.capPct'],
  ])('rejects CPN with %s', async (_name, terms, path) => {
    const res = await post({ productType: 'CPN', terms });
    expect(res.status).toBe(400);
    expect(issuePaths(res)).toContain(path);
  });

  it('rejects an unknown or missing product type', async () => {
    expect((await post({ productType: 'FCN', terms: {} })).status).toBe(400);
    expect((await post({ terms: eln })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it('rejects an empty body without crashing', async () => {
    const res = await request(app).post('/api/configure');
    expect(res.status).toBe(400);
    expect(errorBody(res).code).toBe('VALIDATION_ERROR');
  });

  it('rejects numbers sent as strings', async () => {
    const res = await post({ productType: 'ELN', terms: { ...eln, notional: '1000000' } });
    expect(res.status).toBe(400);
  });
});
