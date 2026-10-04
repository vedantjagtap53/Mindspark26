// Test-only forecast fixture builder. Never used for production data (CLAUDE.md).
import { tenorToTradingDays, type ForecastResponse } from '@mindspark/shared';

/** Deterministic straight-line path from spot to `end` with `steps` steps. */
export function linePath(spot: number, end: number, steps: number): number[] {
  return Array.from({ length: steps + 1 }, (_, i) => spot + ((end - spot) * i) / steps);
}

export interface FixtureOptions {
  tenorDays?: number;
  spot?: number;
  samplePathCount?: number;
  asOf?: string;
}

export function makeForecast(opts: FixtureOptions = {}): ForecastResponse {
  const tenorDays = opts.tenorDays ?? 182;
  const spot = opts.spot ?? 25000;
  const n = opts.samplePathCount ?? 100;
  const steps = tenorToTradingDays(tenorDays);
  // Sample terminals spread evenly from 70% to 130% of spot.
  const samplePaths = Array.from({ length: n }, (_, i) =>
    linePath(spot, spot * (0.7 + (0.6 * i) / (n - 1)), steps),
  );
  return {
    contractVersion: '1.0',
    model: {
      name: 'garch11-t-montecarlo',
      version: '1.0.0',
      simulations: 10000,
      drift: { method: 'historical-mean', annualized: 0.11 },
    },
    data: {
      symbol: '^NSEI',
      asOf: opts.asOf ?? '2026-10-02',
      trainingStart: '2016-10-03',
      trainingEnd: '2026-10-02',
      observations: 2468,
      spot,
    },
    horizon: { tenorDays, tradingDays: steps },
    cases: {
      low: { percentile: 5, path: linePath(spot, spot * 0.85, steps) },
      base: { percentile: 50, path: linePath(spot, spot * 1.04, steps) },
      high: { percentile: 95, path: linePath(spot, spot * 1.22, steps) },
    },
    terminalQuantiles: { p5: spot * 0.85, p50: spot * 1.04, p95: spot * 1.22 },
    fan: {
      p5: linePath(spot, spot * 0.85, steps),
      p50: linePath(spot, spot * 1.04, steps),
      p95: linePath(spot, spot * 1.22, steps),
    },
    samplePaths,
    backtest: {
      horizonTradingDays: steps,
      windows: 30,
      bandCoverage: 0.88,
      baseMape: 0.071,
      naiveMape: 0.074,
    },
  };
}

export const FIXTURE_NOW = new Date('2026-10-03T06:00:00Z');
