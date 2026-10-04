// Turns a validated forecast into inputs for the deterministic payoff engines (PRD.md §7.2).
// No payoff formula or knock-in rule lives here: the product engine is passed in as a
// `PathEvaluator`, so Mode A and Mode B share the same engines and the same barrier rule
// (CLAUDE.md engineering rules).

import type { ForecastCase, ForecastResponse } from '@mindspark/shared';

/** Engine result on one underlying path (path[0] = S_0, last = S_T). */
export interface PathOutcome {
  payoff: number;
  /** `null` when the product has no barrier. */
  knockedIn: boolean | null;
}

export type PathEvaluator<T extends PathOutcome = PathOutcome> = (path: readonly number[]) => T;

export interface ModeACase<T extends PathOutcome = PathOutcome> {
  case: ForecastCase;
  percentile: number;
  path: readonly number[];
  terminal: number;
  pathMin: number;
  outcome: T;
}

export function buildModeACases<T extends PathOutcome>(
  forecast: ForecastResponse,
  evaluate: PathEvaluator<T>,
): ModeACase<T>[] {
  return (['low', 'base', 'high'] as const).map((key) => {
    const { percentile, path } = forecast.cases[key];
    return {
      case: key,
      percentile,
      path,
      terminal: path[path.length - 1]!,
      pathMin: Math.min(...path),
      outcome: evaluate(path),
    };
  });
}

export interface DistributionMetrics {
  pathCount: number;
  /** Share of sample paths whose payoff is below the amount invested. */
  probabilityOfLoss: number;
  /** `null` when the product has no barrier. */
  probabilityOfKnockIn: number | null;
  payoffQuantiles: { p5: number; p50: number; p95: number };
}

/** Linear-interpolated quantile on a sorted array (same method as numpy's default). */
export function quantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) throw new Error('quantile of empty array');
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function summarizeDistribution(
  forecast: ForecastResponse,
  evaluate: PathEvaluator,
  invested: number,
): DistributionMetrics {
  const outcomes = forecast.samplePaths.map((p) => evaluate(p));
  const payoffs = outcomes.map((o) => o.payoff);
  const sorted = [...payoffs].sort((a, b) => a - b);
  const losses = payoffs.filter((v) => v < invested).length;
  const hasBarrier = outcomes.some((o) => o.knockedIn !== null);
  const knockIns = outcomes.filter((o) => o.knockedIn === true).length;
  return {
    pathCount: outcomes.length,
    probabilityOfLoss: losses / outcomes.length,
    probabilityOfKnockIn: hasBarrier ? knockIns / outcomes.length : null,
    payoffQuantiles: {
      p5: quantileSorted(sorted, 0.05),
      p50: quantileSorted(sorted, 0.5),
      p95: quantileSorted(sorted, 0.95),
    },
  };
}

/** Forecast fields kept in the simulation record (PRD.md §7.2 record keeping). */
export function forecastRecordMetadata(f: ForecastResponse) {
  return {
    contractVersion: f.contractVersion,
    model: f.model,
    data: f.data,
    horizon: f.horizon,
    terminalQuantiles: f.terminalQuantiles,
    caseTerminals: {
      low: f.cases.low.path[f.cases.low.path.length - 1]!,
      base: f.cases.base.path[f.cases.base.path.length - 1]!,
      high: f.cases.high.path[f.cases.high.path.length - 1]!,
    },
    backtest: f.backtest,
  };
}
