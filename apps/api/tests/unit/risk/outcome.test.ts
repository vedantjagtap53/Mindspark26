import { describe, expect, it } from 'vitest';
import { outcomeMetrics } from '../../../src/engines/risk/outcome.js';

describe('outcomeMetrics', () => {
  it('reports a gain as a positive percent with no loss', () => {
    const r = outcomeMetrics(1_000_000, 1_100_000);
    expect(r.returnPct).toBeCloseTo(10, 10);
    expect(r.lossAmount).toBe(0);
  });

  it('reports a loss amount and negative percent', () => {
    const r = outcomeMetrics(1_000_000, 850_000);
    expect(r.returnPct).toBeCloseTo(-15, 10);
    expect(r.lossAmount).toBe(150_000);
  });

  it('returns exactly zero when the amount invested is repaid', () => {
    expect(outcomeMetrics(1_000_000, 1_000_000)).toEqual({ returnPct: 0, lossAmount: 0 });
  });

  it.each([0, -5, Number.NaN, Infinity])('rejects invested = %d', (invested) => {
    expect(() => outcomeMetrics(invested, 1)).toThrow(RangeError);
  });
});
