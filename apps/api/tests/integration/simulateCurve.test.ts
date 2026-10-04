// Mode B payoff curve and PRD scenario table: same engines as the main result.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  PAYOFF_CURVE_SHOCKS,
  SCENARIO_SHOCKS,
  type SimulateModeBResponse,
} from '@mindspark/shared';
import { buildConfig } from '../../src/config/index.js';
import { parseEnv } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { createMarketDataService } from '../../src/services/market-data/marketDataService.js';
import { silentLogger } from '../../src/utils/logger.js';

const app = createApp(buildConfig(parseEnv({})), silentLogger, {
  marketData: createMarketDataService({}),
});
const simulate = async (body: object) =>
  (await request(app).post('/api/simulate').send(body)).body as SimulateModeBResponse;

const eln = {
  underlying: { symbol: '^NSEI', assetClass: 'index' },
  notional: 1_000_000,
  tenorDays: 365,
  strikePct: 100,
  couponPct: 10,
  barrierPct: 80,
  barrierType: 'European',
};
const elnRequest = (shockPct: number) => ({
  mode: 'B',
  productType: 'ELN',
  terms: eln,
  shockPct,
  level: { source: 'manual', value: 25_000 },
});

describe('Mode B payoff curve and scenario table', () => {
  it('returns 21 curve points from −50% to +50% and the PRD scenarios', async () => {
    const body = await simulate(elnRequest(-10));
    expect(body.curve.map((p) => p.shockPct)).toEqual([...PAYOFF_CURVE_SHOCKS]);
    expect(PAYOFF_CURVE_SHOCKS[0]).toBe(-50);
    expect(PAYOFF_CURVE_SHOCKS.at(-1)).toBe(50);
    expect(body.scenarios.map((p) => p.shockPct)).toEqual([-25, -10, 0, 15]);
    expect([...SCENARIO_SHOCKS]).toEqual([-25, -10, 0, 15]);
  });

  it('every point matches a direct simulation at that shock', async () => {
    const body = await simulate(elnRequest(0));
    for (const point of body.scenarios) {
      const direct = await simulate(elnRequest(point.shockPct));
      expect(point.payoff).toBeCloseTo(direct.result.payoff, 9);
      expect(point.knockedIn).toBe(direct.result.knockedIn);
      expect(point.level).toBeCloseTo(direct.shock.shockedLevel, 9);
    }
  });

  it('shows the ELN barrier cliff at −20% (touch counts) with the worked-example payoffs', async () => {
    const curve = (await simulate(elnRequest(0))).curve;
    const at = (s: number) => curve.find((p) => p.shockPct === s)!;
    expect(at(-15)).toMatchObject({ knockedIn: false });
    expect(at(-15).payoff).toBeCloseTo(1_100_000, 6);
    expect(at(-20)).toMatchObject({ knockedIn: true });
    expect(at(-20).payoff).toBeCloseTo(900_000, 6);
    expect(at(-25).payoff).toBeCloseTo(850_000, 6);
    expect(at(-25).lossAmount).toBeCloseTo(150_000, 6);
    expect(at(50).returnPct).toBeCloseTo(10, 9);
  });

  it('breakevens: the barrier cliff for a barrier ELN, the coupon offset for a plain ELN', async () => {
    const barrier = (await simulate(elnRequest(0))).breakevens;
    expect(barrier).toHaveLength(1);
    expect(barrier[0]!.shockPct).toBeCloseTo(-20, 3);
    expect(barrier[0]!.level).toBeCloseTo(20_000, 1);

    // Plain ELN, 10% coupon over a year: the fall is offset until −10% (coupon 10% of notional).
    const plain = await simulate({
      mode: 'B',
      productType: 'ELN',
      terms: { ...eln, barrierPct: undefined, barrierType: undefined },
      shockPct: 0,
      level: { source: 'manual', value: 25_000 },
    });
    expect(plain.breakevens).toHaveLength(1);
    expect(plain.breakevens[0]!.shockPct).toBeCloseTo(-10, 3);
  });

  it('DCD curve moves the FX rate and caps the gain at the coupon', async () => {
    const body = await simulate({
      mode: 'B',
      productType: 'DCD',
      shockPct: 0,
      level: { source: 'manual', value: 80 },
      terms: {
        depositCurrency: 'USD',
        alternateCurrency: 'INR',
        depositAmount: 100_000,
        tenorDays: 90,
        strikeRate: 84,
        enhancedRatePct: 8,
      },
    });
    const due = 100_000 * (1 + (0.08 * 90) / 365);
    const at = (s: number) => body.curve.find((p) => p.shockPct === s)!;
    expect(at(-50).payoff).toBeCloseTo(due, 6);
    expect(at(-50).level).toBeCloseTo(40, 9);
    expect(at(50).payoff).toBeCloseTo((due * 84) / 120, 6);
    expect(at(50).knockedIn).toBeNull();
  });
});
