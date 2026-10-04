// Worked examples from the product notes (ELN_DCD_CPN_Notes.pdf), plus boundary cases.
// Project convention: touching the barrier counts as knock-in (S ≤ B), T = tenorDays / 365.
import { describe, expect, it } from 'vitest';
import type { ElnTerms } from '@mindspark/shared';
import {
  elnFormula,
  elnPayoff,
  isBarrierKnockedIn,
  PayoffInputError,
} from '../../../src/engines/payoff/index.js';

const N = 1_000_000;
const S0 = 25_000;
const plain: ElnTerms = {
  underlying: { symbol: '^NSEI', assetClass: 'index' },
  notional: N,
  tenorDays: 365,
  strikePct: 100,
  couponPct: 10,
};
const european: ElnTerms = { ...plain, barrierPct: 80, barrierType: 'European' };
const american: ElnTerms = { ...plain, barrierPct: 80, barrierType: 'American' };

const terminalPath = (sT: number) => [S0, sT];
const ret = (payoff: number) => payoff / N - 1;

describe('ELN plain — worked example (N ₹10,00,000, K 100%, c 10%, T 1y)', () => {
  it.each([
    [28_750, 1_100_000, 0.1],
    [25_000, 1_100_000, 0.1],
    [18_750, 850_000, -0.15],
    [12_500, 600_000, -0.4],
  ])('S_T %d → payoff %d, return %d', (sT, payoff, r) => {
    const res = elnPayoff(plain, terminalPath(sT));
    expect(res.payoff).toBeCloseTo(payoff, 6);
    expect(ret(res.payoff)).toBeCloseTo(r, 12);
    expect(res.knockedIn).toBeNull();
    expect(res.barrierLevel).toBeNull();
  });

  it('S_T 22,500 (−10%) reduces principal on a plain ELN: N·S_T/K + N·c·T', () => {
    // The notes' plain-ELN table lists ₹11,00,000 here, which contradicts their own plain
    // formula and PRD §7.2 (S_T < K always reduces principal). The formula gives ₹10,00,000.
    const res = elnPayoff(plain, terminalPath(22_500));
    expect(res.principalRepaid).toBeCloseTo(900_000, 6);
    expect(res.payoff).toBeCloseTo(1_000_000, 6);
  });

  it('splits payoff into principal and coupon', () => {
    const res = elnPayoff(plain, terminalPath(18_750));
    expect(res.principalRepaid).toBeCloseTo(750_000, 6);
    expect(res.couponAmount).toBeCloseTo(100_000, 6);
    expect(res.strikeLevel).toBe(25_000);
  });
});

describe('ELN European barrier — worked example (B 80% = 20,000)', () => {
  it.each([
    [28_750, false, 1_100_000, 0.1],
    [25_000, false, 1_100_000, 0.1],
    [22_500, false, 1_100_000, 0.1],
    [18_750, true, 850_000, -0.15],
    [12_500, true, 600_000, -0.4],
  ])('S_T %d → knocked in %s, payoff %d, return %d', (sT, ki, payoff, r) => {
    const res = elnPayoff(european, terminalPath(sT));
    expect(res.knockedIn).toBe(ki);
    expect(res.barrierLevel).toBe(20_000);
    expect(res.payoff).toBeCloseTo(payoff, 6);
    expect(ret(res.payoff)).toBeCloseTo(r, 12);
  });

  it('shows the barrier cliff: −19% → +10%, −21% → −11%', () => {
    expect(ret(elnPayoff(european, terminalPath(S0 * 0.81)).payoff)).toBeCloseTo(0.1, 12);
    expect(ret(elnPayoff(european, terminalPath(S0 * 0.79)).payoff)).toBeCloseTo(-0.11, 12);
  });

  it('touching the barrier exactly counts as knock-in (project convention, not the notes’ S_T < B)', () => {
    const res = elnPayoff(european, terminalPath(20_000));
    expect(res.knockedIn).toBe(true);
    expect(res.payoff).toBeCloseTo(900_000, 6);
  });

  it('just above the barrier is not knocked in', () => {
    const res = elnPayoff(european, terminalPath(20_000.01));
    expect(res.knockedIn).toBe(false);
    expect(res.payoff).toBeCloseTo(1_100_000, 6);
  });

  it('checks only S_T for a European barrier', () => {
    const res = elnPayoff(european, [S0, 15_000, 26_000]);
    expect(res.knockedIn).toBe(false);
    expect(res.payoff).toBeCloseTo(1_100_000, 6);
  });
});

describe('ELN American barrier', () => {
  it('path never touches B → no knock-in, no loss even though S_T < K', () => {
    const res = elnPayoff(american, [S0, 24_000, 21_000, 22_500]);
    expect(res.knockedIn).toBe(false);
    expect(res.payoff).toBeCloseTo(1_100_000, 6);
  });

  it('path touches B exactly → knock-in', () => {
    const res = elnPayoff(american, [S0, 20_000, 22_500]);
    expect(res.knockedIn).toBe(true);
    expect(res.payoff).toBeCloseTo(1_000_000, 6);
  });

  it('path breaches B then recovers above K → knocked in but no loss', () => {
    const res = elnPayoff(american, [S0, 19_000, 26_000]);
    expect(res.knockedIn).toBe(true);
    expect(res.payoff).toBeCloseTo(1_100_000, 6);
  });

  it('path breaches B and ends below K → loss', () => {
    const res = elnPayoff(american, [S0, 19_000, 18_750]);
    expect(res.knockedIn).toBe(true);
    expect(res.payoff).toBeCloseTo(850_000, 6);
  });

  it('Mode B: a one-point shocked path knocks in when the shocked level touches B', () => {
    expect(elnPayoff(american, terminalPath(20_000)).knockedIn).toBe(true);
    expect(elnPayoff(american, terminalPath(20_500)).knockedIn).toBe(false);
  });

  it('does not test S_0 itself against the barrier', () => {
    expect(isBarrierKnockedIn([10, 20, 20], 15, 'American')).toBe(false);
  });
});

describe('ELN conversions and precision', () => {
  it('converts percent fields once: strike 95% of S_0, coupon 12%', () => {
    const res = elnPayoff({ ...plain, strikePct: 95, couponPct: 12 }, terminalPath(S0));
    expect(res.strikeLevel).toBe(23_750);
    expect(res.couponAmount).toBeCloseTo(120_000, 6);
  });

  it('uses T = tenorDays / 365', () => {
    expect(elnPayoff({ ...plain, tenorDays: 182 }, terminalPath(S0)).couponAmount).toBeCloseTo(
      (N * 0.1 * 182) / 365,
      6,
    );
    expect(elnPayoff({ ...plain, tenorDays: 1095 }, terminalPath(S0)).couponAmount).toBeCloseTo(
      300_000,
      6,
    );
  });

  it('detects a touch at a barrier level that is not exactly representable', () => {
    // 70% of 3 = 2.1; 0.7 × 3 in floating point is 2.0999999999999996.
    const terms: ElnTerms = { ...plain, barrierPct: 70, barrierType: 'European' };
    expect(elnPayoff(terms, [3, 0.7 * 3]).knockedIn).toBe(true);
    expect(elnPayoff(terms, [3, 2.1]).knockedIn).toBe(true);
  });

  it('repays exactly N when S_T equals K up to rounding', () => {
    expect(elnPayoff({ ...plain, strikePct: 70 }, [3, 0.7 * 3]).principalRepaid).toBe(N);
  });

  it('zero coupon returns principal only', () => {
    expect(elnPayoff({ ...plain, couponPct: 0 }, terminalPath(S0)).payoff).toBe(N);
  });

  it('is deterministic', () => {
    expect(elnPayoff(american, [S0, 19_000, 21_000])).toEqual(
      elnPayoff(american, [S0, 19_000, 21_000]),
    );
  });

  it('formula matches the single-line PRD expression', () => {
    const r = elnFormula({
      notional: N,
      coupon: 0.1,
      t: 1,
      strike: 25_000,
      terminal: 18_750,
      lossApplies: true,
    });
    expect(r.payoff).toBeCloseTo(N * 1.1 - (N * (25_000 - 18_750)) / 25_000, 6);
  });

  it.each([[[S0]], [[S0, 0]], [[S0, -1]], [[S0, Number.NaN]], [[S0, Infinity]]])(
    'rejects invalid path %j',
    (path) => {
      expect(() => elnPayoff(plain, path)).toThrow(PayoffInputError);
    },
  );
});
