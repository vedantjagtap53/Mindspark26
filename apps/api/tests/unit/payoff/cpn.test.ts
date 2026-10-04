// Worked example from the product notes (N ₹10,00,000, p 100%, α 60%, T 3y), plus cases.
// The cap follows the documented formula min(α·upside, C); its meaning is still an open decision.
import { describe, expect, it } from 'vitest';
import type { CpnTerms } from '@mindspark/shared';
import { cpnPayoff, PayoffInputError } from '../../../src/engines/payoff/index.js';

const N = 1_000_000;
const S0 = 25_000;
const terms: CpnTerms = {
  underlying: { symbol: '^NSEI', assetClass: 'index' },
  notional: N,
  tenorDays: 1095,
  protectionPct: 100,
  participationPct: 60,
};
const at = (move: number) => [S0, S0 * (1 + move)];

describe('CPN worked example', () => {
  it('Nifty +20% → ₹11,20,000', () => {
    expect(cpnPayoff(terms, at(0.2)).payoff).toBeCloseTo(1_120_000, 6);
  });

  it('Nifty −30% → ₹10,00,000 (protection at maturity)', () => {
    expect(cpnPayoff(terms, at(-0.3)).payoff).toBeCloseTo(1_000_000, 6);
  });
});

describe('CPN engine', () => {
  it('S_T = S_0 → protection only, no participation', () => {
    const r = cpnPayoff(terms, [S0, S0]);
    expect(r.payoff).toBe(N);
    expect(r.participationReturn).toBe(0);
  });

  it('protection below 100% sets the floor', () => {
    expect(cpnPayoff({ ...terms, protectionPct: 90 }, at(-0.3)).payoff).toBeCloseTo(900_000, 6);
    expect(cpnPayoff({ ...terms, protectionPct: 90 }, at(0.2)).payoff).toBeCloseTo(1_020_000, 6);
  });

  it('participation scales the upside', () => {
    expect(cpnPayoff({ ...terms, participationPct: 100 }, at(0.2)).payoff).toBeCloseTo(
      1_200_000,
      6,
    );
  });

  it('ignores the path between S_0 and S_T', () => {
    expect(cpnPayoff(terms, [S0, 10_000, S0 * 1.2]).payoff).toBeCloseTo(1_120_000, 6);
  });

  it('does not depend on tenor (no coupon term)', () => {
    expect(cpnPayoff({ ...terms, tenorDays: 30 }, at(0.2)).payoff).toBeCloseTo(1_120_000, 6);
  });

  it('is deterministic', () => {
    expect(cpnPayoff(terms, at(0.2))).toEqual(cpnPayoff(terms, at(0.2)));
  });

  it.each([[[S0]], [[0, S0]], [[S0, -5]]])('rejects invalid path %j', (path) => {
    expect(() => cpnPayoff(terms, path)).toThrow(PayoffInputError);
  });
});

describe('CPN cap (documented formula: min(α·upside, C))', () => {
  const capped = { ...terms, capPct: 10 };

  it('caps the participation return above C', () => {
    const r = cpnPayoff(capped, at(0.2));
    expect(r.participationReturn).toBeCloseTo(0.12, 12);
    expect(r.paidReturn).toBe(0.1);
    expect(r.capApplied).toBe(true);
    expect(r.payoff).toBeCloseTo(1_100_000, 6);
  });

  it('pays the participation return below C', () => {
    const r = cpnPayoff(capped, at(0.1));
    expect(r.capApplied).toBe(false);
    expect(r.payoff).toBeCloseTo(1_060_000, 6);
  });

  it('at the cap boundary both sides give the same payoff', () => {
    expect(cpnPayoff({ ...terms, capPct: 12 }, at(0.2)).payoff).toBeCloseTo(1_120_000, 6);
  });

  it('a cap does not affect downside outcomes', () => {
    expect(cpnPayoff(capped, at(-0.3)).payoff).toBeCloseTo(1_000_000, 6);
  });
});
