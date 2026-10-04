// Worked example from the product notes (USD deposit, INR alternate), plus boundary cases.
// Quote convention: K and X_T are INR per 1 USD (alternate per 1 deposit unit).
import { describe, expect, it } from 'vitest';
import type { DcdTerms } from '@mindspark/shared';
import { dcdFormula, dcdPayoff, PayoffInputError } from '../../../src/engines/payoff/index.js';

const terms: DcdTerms = {
  depositCurrency: 'USD',
  alternateCurrency: 'INR',
  depositAmount: 10_000,
  tenorDays: 30,
  strikeRate: 85,
  enhancedRatePct: 8,
};

describe('DCD worked example (formula with the notes’ T = 1/12)', () => {
  // The notes use T = 1/12 for "1 month". The project convention is T = tenorDays / 365 and
  // no whole number of days gives exactly 1/12, so the notes' figures are checked on the
  // formula directly; the convention is checked separately below.
  const base = { deposit: 10_000, rate: 0.08, t: 1 / 12, strikeRate: 85 };

  it('amount due is USD 10,066.67', () => {
    expect(dcdFormula({ ...base, terminalRate: 84.5 }).amountDue).toBeCloseTo(10_066.67, 2);
  });

  it('X_T 84.5 ≤ K → repaid USD 10,066.67 in USD', () => {
    const r = dcdFormula({ ...base, terminalRate: 84.5 });
    expect(r.converted).toBe(false);
    expect(r.payoff).toBeCloseTo(10_066.67, 2);
    expect(r.settlementAmount).toBeCloseTo(10_066.67, 2);
  });

  it('X_T 88 > K → repaid ≈ ₹8,55,667, worth ≈ USD 9,724, return ≈ −2.8%', () => {
    const r = dcdFormula({ ...base, terminalRate: 88 });
    expect(r.converted).toBe(true);
    expect(Math.round(r.settlementAmount)).toBe(855_667);
    expect(Math.abs(r.payoff - 9_724)).toBeLessThan(1);
    expect(r.payoff).toBeCloseTo(855_666.67 / 88, 2);
    expect(r.payoff / 10_000 - 1).toBeCloseTo(-0.028, 3);
  });
});

describe('DCD engine (project convention T = tenorDays / 365)', () => {
  const due = 10_000 * (1 + (0.08 * 30) / 365);

  it('X_T < K → repaid in the deposit currency', () => {
    const r = dcdPayoff(terms, 84);
    expect(r.converted).toBe(false);
    expect(r.settlementCurrency).toBe('USD');
    expect(r.payoff).toBeCloseTo(due, 9);
    expect(r.settlementAmount).toBeCloseTo(due, 9);
  });

  it('X_T = K → not converted (conversion only when X_T > K)', () => {
    const r = dcdPayoff(terms, 85);
    expect(r.converted).toBe(false);
    expect(r.payoff).toBeCloseTo(due, 9);
  });

  it('X_T equal to K up to rounding → not converted', () => {
    expect(dcdPayoff({ ...terms, strikeRate: 0.1 + 0.2 }, 0.3).converted).toBe(false);
  });

  it('X_T > K → repaid N(1+cT)·K in the alternate currency, valued at ·K/X_T', () => {
    const r = dcdPayoff(terms, 88);
    expect(r.converted).toBe(true);
    expect(r.settlementCurrency).toBe('INR');
    expect(r.settlementAmount).toBeCloseTo(due * 85, 6);
    expect(r.payoff).toBeCloseTo((due * 85) / 88, 9);
    expect(r.payoff).toBeLessThan(10_000);
  });

  it('matches N(1 + cT) · min(1, K / X_T) across rates', () => {
    for (const x of [70, 84.99, 85, 85.01, 100, 120]) {
      expect(dcdPayoff(terms, x).payoff).toBeCloseTo(due * Math.min(1, 85 / x), 9);
    }
  });

  it('gain is capped at the enhanced coupon however far the rate falls', () => {
    expect(dcdPayoff(terms, 10).payoff).toBeCloseTo(due, 9);
  });

  it('converts the rate percent once and uses T = tenorDays / 365', () => {
    const r = dcdPayoff({ ...terms, enhancedRatePct: 12, tenorDays: 365 }, 80);
    expect(r.amountDue).toBeCloseTo(11_200, 9);
  });

  it('is deterministic', () => {
    expect(dcdPayoff(terms, 88)).toEqual(dcdPayoff(terms, 88));
  });

  it.each([0, -1, Number.NaN, Infinity])('rejects terminal rate %d', (x) => {
    expect(() => dcdPayoff(terms, x)).toThrow(PayoffInputError);
  });
});
