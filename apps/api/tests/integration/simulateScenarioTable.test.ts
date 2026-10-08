// PRD scenario table (shocks −25, −10, 0, +15) for each product, Mode B. Pins why several rows can
// show the same payoff: a barrier ELN and a DCD below its strike pay a flat amount, a CPN is flat
// until the participation return passes zero or the cap. Every figure is from the PRD formulas.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { type ShockOutcome, type SimulateModeBResponse } from '@mindspark/shared';
import { buildConfig } from '../../src/config/index.js';
import { parseEnv } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { createMarketDataService } from '../../src/services/market-data/marketDataService.js';
import { silentLogger } from '../../src/utils/logger.js';

const app = createApp(buildConfig(parseEnv({})), silentLogger, {
  marketData: createMarketDataService({}),
});

async function scenarios(
  productType: string,
  terms: object,
  level: number,
): Promise<ShockOutcome[]> {
  const res = await request(app)
    .post('/api/simulate')
    .send({
      mode: 'B',
      productType,
      terms,
      shockPct: 0,
      level: { source: 'manual', value: level },
    });
  expect(res.status).toBe(200);
  return (res.body as SimulateModeBResponse).scenarios;
}

const payoffs = (rows: ShockOutcome[]) => rows.map((r) => r.payoff);

const nifty = { symbol: '^NSEI', assetClass: 'index' };
const N = 1_000_000;

describe('Mode B scenario table: −25%, −10%, 0%, +15%', () => {
  it('lists exactly the four PRD shocks, in order', async () => {
    const rows = await scenarios(
      'ELN',
      { underlying: nifty, notional: N, tenorDays: 365, strikePct: 100, couponPct: 10 },
      25_000,
    );
    expect(rows.map((r) => r.shockPct)).toEqual([-25, -10, 0, 15]);
  });

  it('barrier ELN (B 80%): only −25% knocks in; −10%, 0% and +15% all pay principal + coupon', async () => {
    const rows = await scenarios(
      'ELN',
      {
        underlying: nifty,
        notional: N,
        tenorDays: 365,
        strikePct: 100,
        couponPct: 10,
        barrierPct: 80,
        barrierType: 'European',
      },
      25_000,
    );
    expect(rows.map((r) => r.knockedIn)).toEqual([true, false, false, false]);
    const [p25, p10, p0, p15] = payoffs(rows);
    expect(p25).toBeCloseTo(850_000, 6); // 1,100,000 − 1,000,000 × 25%
    expect(p10).toBeCloseTo(1_100_000, 6);
    expect(p0).toBeCloseTo(1_100_000, 6);
    expect(p15).toBeCloseTo(1_100_000, 6); // upside is capped at the coupon
  });

  it('plain ELN: the loss term applies at −10% too, so −10% differs from 0% and +15%', async () => {
    const rows = await scenarios(
      'ELN',
      { underlying: nifty, notional: N, tenorDays: 365, strikePct: 100, couponPct: 10 },
      25_000,
    );
    expect(rows.every((r) => r.knockedIn === null)).toBe(true);
    const [p25, p10, p0, p15] = payoffs(rows);
    expect(p25).toBeCloseTo(850_000, 6);
    expect(p10).toBeCloseTo(1_000_000, 6); // 1,100,000 − 1,000,000 × 10%
    expect(p0).toBeCloseTo(1_100_000, 6);
    expect(p15).toBeCloseTo(1_100_000, 6);
  });

  it('a barrier above 90% knocks in at −10% as well', async () => {
    const rows = await scenarios(
      'ELN',
      {
        underlying: nifty,
        notional: N,
        tenorDays: 365,
        strikePct: 100,
        couponPct: 10,
        barrierPct: 92,
        barrierType: 'European',
      },
      25_000,
    );
    expect(rows.map((r) => r.knockedIn)).toEqual([true, true, false, false]);
    expect(rows[1]!.payoff).toBeCloseTo(1_000_000, 6);
  });

  it('DCD: pays the full amount due at or below the strike and converts above it', async () => {
    const terms = {
      depositCurrency: 'USD',
      alternateCurrency: 'INR',
      depositAmount: 100_000,
      tenorDays: 90,
      strikeRate: 84,
      enhancedRatePct: 8,
    };
    const rows = await scenarios('DCD', terms, 80);
    const due = 100_000 * (1 + (0.08 * 90) / 365);
    expect(rows.map((r) => r.level)).toEqual([60, 72, 80, 92]);
    const [p25, p10, p0, p15] = payoffs(rows);
    for (const p of [p25, p10, p0]) expect(p).toBeCloseTo(due, 6);
    expect(p15).toBeCloseTo((due * 84) / 92, 6); // X_T 92 > K 84: converted
    expect(p15!).toBeLessThan(due);
    expect(rows.every((r) => r.knockedIn === null)).toBe(true);
  });

  it('DCD: shows what is paid next to its deposit-currency equivalent', async () => {
    const terms = {
      depositCurrency: 'USD',
      alternateCurrency: 'INR',
      depositAmount: 100_000,
      tenorDays: 90,
      strikeRate: 84,
      enhancedRatePct: 8,
    };
    // Start at the strike, so every positive shock ends above it and converts.
    const rows = await scenarios('DCD', terms, 84);
    const due = 100_000 * (1 + (0.08 * 90) / 365);
    const [p25, p10, p0, p15] = rows;
    for (const row of [p25!, p10!, p0!]) {
      expect(row.settlement).toMatchObject({ currency: 'USD', converted: false });
      expect(row.settlement!.amount).toBeCloseTo(due, 6);
    }
    expect(p15!.settlement).toMatchObject({ currency: 'INR', converted: true });
    expect(p15!.settlement!.amount).toBeCloseTo(due * 84, 4);
    // The INR amount is fixed once converted; its USD equivalent falls as the rate rises.
    const higher = (await scenarios('DCD', terms, 84 * 1.1))[3]!;
    expect(higher.settlement!.amount).toBeCloseTo(p15!.settlement!.amount, 4);
    expect(higher.payoff).toBeLessThan(p15!.payoff);
    expect(p15!.payoff).toBeCloseTo((due * 84) / (84 * 1.15), 6);
  });

  it('ELN rows carry no settlement field', async () => {
    const rows = await scenarios(
      'ELN',
      { underlying: nifty, notional: N, tenorDays: 182, strikePct: 100, couponPct: 9.5 },
      25_000,
    );
    expect(rows.every((r) => r.settlement === undefined)).toBe(true);
  });

  it('CPN (protection 100%, participation 80%, cap 10%): flat at principal until the cap binds', async () => {
    const rows = await scenarios(
      'CPN',
      {
        underlying: nifty,
        notional: N,
        tenorDays: 365,
        protectionPct: 100,
        participationPct: 80,
        capPct: 10,
      },
      25_000,
    );
    const [p25, p10, p0, p15] = payoffs(rows);
    for (const p of [p25, p10, p0]) expect(p).toBeCloseTo(N, 6);
    expect(p15).toBeCloseTo(1_100_000, 6); // 80% × 15% = 12% > cap 10%
  });
});
