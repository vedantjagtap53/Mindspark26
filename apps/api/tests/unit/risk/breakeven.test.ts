import { describe, expect, it } from 'vitest';
import { findBreakevenShocks } from '../../../src/engines/risk/breakeven.js';

describe('findBreakevenShocks', () => {
  it('finds the single crossing of a continuous payoff (plain ELN: coupon offsets the fall)', () => {
    // Return = shock + 4.7 below the strike (shock < 0), +4.7 above it.
    const eln = (s: number) => (s < 0 ? s + 4.7 : 4.7);
    const [b, ...rest] = findBreakevenShocks(eln);
    expect(rest).toEqual([]);
    expect(b).toBeCloseTo(-4.7, 4);
  });

  it('reports a knock-in cliff at the barrier (touching counts as knock-in)', () => {
    // Barrier at -20%: at or below it the client takes the fall, above it only the coupon.
    const barrierEln = (s: number) => (s <= -20 ? s + 4.7 : 4.7);
    const [b] = findBreakevenShocks(barrierEln);
    expect(b).toBeCloseTo(-20, 3);
  });

  it('is empty when there is never a loss (full capital protection)', () => {
    expect(findBreakevenShocks(() => 0)).toEqual([]);
    expect(findBreakevenShocks((s) => Math.max(0, s * 0.8))).toEqual([]);
  });

  it('is empty when every scanned outcome is a loss', () => {
    expect(findBreakevenShocks(() => -5)).toEqual([]);
  });

  it('returns every crossing, ascending, for a payoff that loses on both sides', () => {
    // Loss below -10% and above +30% (e.g. conversion on a rise past a strike).
    const twoSided = (s: number) => (s < -10 || s > 30 ? -3 : 2);
    const found = findBreakevenShocks(twoSided);
    expect(found).toHaveLength(2);
    expect(found[0]).toBeCloseTo(-10, 3);
    expect(found[1]).toBeCloseTo(30, 3);
  });

  it('ignores floating-point noise around zero', () => {
    expect(findBreakevenShocks(() => -1e-12)).toEqual([]);
  });

  it('rejects an invalid scan range', () => {
    expect(() => findBreakevenShocks(() => 0, { minShockPct: -100 })).toThrow(RangeError);
    expect(() => findBreakevenShocks(() => 0, { stepPct: 0 })).toThrow(RangeError);
  });
});
