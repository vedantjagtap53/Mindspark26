import { describe, expect, it } from 'vitest';
import type { ElnTerms } from '@mindspark/shared';
import { elnPayoff } from '../../../src/engines/payoff/index.js';
import {
  buildModeACases,
  forecastRecordMetadata,
  quantileSorted,
  summarizeDistribution,
  type PathEvaluator,
} from '../../../src/services/simulation/modeAScenarios.js';
import { makeForecast } from '../../fixtures/forecast.js';

// Real ELN engine as the evaluator, so the barrier rule is the production one (touching counts).
const eln = (barrier?: { pct: number; type: 'European' | 'American' }): PathEvaluator => {
  const terms: ElnTerms = {
    underlying: { symbol: '^NSEI', assetClass: 'index' },
    notional: 100,
    tenorDays: 182,
    strikePct: 100,
    couponPct: 0,
    ...(barrier ? { barrierPct: barrier.pct, barrierType: barrier.type } : {}),
  };
  return (path) => elnPayoff(terms, path);
};

describe('buildModeACases', () => {
  it('returns low/base/high with terminals and the engine outcome', () => {
    const f = makeForecast({ spot: 100 });
    const cases = buildModeACases(f, eln({ pct: 90, type: 'European' }));
    expect(cases.map((c) => c.case)).toEqual(['low', 'base', 'high']);
    expect(cases.map((c) => c.percentile)).toEqual([5, 50, 95]);
    expect(cases[0]!.terminal).toBeCloseTo(85);
    expect(cases[0]!.pathMin).toBeCloseTo(85);
    expect(cases.map((c) => c.outcome.knockedIn)).toEqual([true, false, false]);
    expect(cases[0]!.outcome.payoff).toBeCloseTo(85);
  });

  it('American barrier sees the whole case path', () => {
    const f = makeForecast({ spot: 100 });
    // Low path falls in a straight line from 100 to 85, so it crosses 90 before maturity.
    const cases = buildModeACases(f, eln({ pct: 90, type: 'American' }));
    expect(cases[0]!.outcome.knockedIn).toBe(true);
  });

  it('reports null knock-in when the product has no barrier', () => {
    const cases = buildModeACases(makeForecast(), eln());
    expect(cases.every((c) => c.outcome.knockedIn === null)).toBe(true);
  });
});

describe('summarizeDistribution', () => {
  // 101 straight-line sample paths, terminals 70, 70.6, ..., 130 (spot 100).
  const f = makeForecast({ spot: 100, samplePathCount: 101 });

  it('computes loss and knock-in probabilities across sample paths', () => {
    const m = summarizeDistribution(f, eln({ pct: 80, type: 'European' }), 100);
    expect(m.pathCount).toBe(101);
    // Terminals <= 80 knock in (70 + 0.6i <= 80 → i = 0..16): 17 paths, all below the strike.
    expect(m.probabilityOfKnockIn).toBeCloseTo(17 / 101, 12);
    expect(m.probabilityOfLoss).toBeCloseTo(17 / 101, 12);
    expect(m.payoffQuantiles.p50).toBeCloseTo(100);
    expect(m.payoffQuantiles.p5).toBeCloseTo(73);
  });

  it('reports null knock-in probability for a product without a barrier', () => {
    const m = summarizeDistribution(f, eln(), 100);
    expect(m.probabilityOfKnockIn).toBeNull();
    expect(m.probabilityOfLoss).toBeCloseTo(50 / 101, 12);
  });
});

describe('quantileSorted', () => {
  it('matches numpy linear interpolation', () => {
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantileSorted([10], 0.95)).toBe(10);
  });

  it('rejects an empty array', () => {
    expect(() => quantileSorted([], 0.5)).toThrow();
  });
});

describe('forecastRecordMetadata', () => {
  it('drops sample paths and fan from the stored record', () => {
    const meta = forecastRecordMetadata(makeForecast());
    expect(meta).not.toHaveProperty('samplePaths');
    expect(meta).not.toHaveProperty('fan');
    expect(meta.backtest.bandCoverage).toBe(0.88);
  });
});
