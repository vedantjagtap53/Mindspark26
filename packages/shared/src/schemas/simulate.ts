// Request/response contract for POST /api/simulate.
// Mode B (manual shock): percent fields are percent numbers (-10 means -10%). The shock is applied
// to the starting level: S_0 for ELN/CPN, the FX spot for DCD (a positive shock means more
// alternate currency per 1 unit of deposit currency).
// Mode A (forecast): the forecast service's case and sample paths go through the same engines.

import { z } from 'zod';
import {
  DEFAULT_TRAINING_WINDOW_YEARS,
  TRAINING_WINDOW_YEARS_MAX,
  TRAINING_WINDOW_YEARS_MIN,
} from '../constants/forecast.js';
import { cpnTermsSchema, dcdTermsSchema, elnTermsSchema } from './product.js';

export const LEVEL_SOURCES = ['live', 'manual', 'reference'] as const;
export type LevelSource = (typeof LEVEL_SOURCES)[number];

const levelRequestSchema = z.discriminatedUnion('source', [
  /** Live underlying level from the market-data feed (ELN/CPN only). */
  z.strictObject({ source: z.literal('live') }),
  /** Daily FX reference rate from the FX provider (DCD only). */
  z.strictObject({ source: z.literal('reference') }),
  /** Level typed by the RM. Not market data; reported back as `manual`. */
  z.strictObject({ source: z.literal('manual'), value: z.number().positive() }),
]);

const modeB = {
  mode: z.literal('B'),
  // Must stay above -100 so the shocked level is positive.
  shockPct: z.number().gt(-100),
  level: levelRequestSchema,
};

export const simulateModeBRequestSchema = z
  .discriminatedUnion('productType', [
    z.strictObject({ ...modeB, productType: z.literal('ELN'), terms: elnTermsSchema }),
    z.strictObject({ ...modeB, productType: z.literal('DCD'), terms: dcdTermsSchema }),
    z.strictObject({ ...modeB, productType: z.literal('CPN'), terms: cpnTermsSchema }),
  ])
  .superRefine((req, ctx) => {
    if (req.productType === 'DCD' && req.level.source === 'live') {
      ctx.addIssue({
        code: 'custom',
        path: ['level', 'source'],
        message: "DCD uses an FX rate: use 'reference' or 'manual'",
      });
    }
    if (req.productType !== 'DCD' && req.level.source === 'reference') {
      ctx.addIssue({
        code: 'custom',
        path: ['level', 'source'],
        message: "'reference' is only available for DCD: use 'live' or 'manual'",
      });
    }
  });

export type SimulateModeBRequest = z.output<typeof simulateModeBRequestSchema>;

export interface SimulateLevel {
  value: number;
  source: LevelSource;
  /** ISO timestamp (live) or date (reference rate) of the value; `null` when typed by the RM. */
  asOf: string | null;
}

export interface SimulateModeBResponse {
  /** Id for /api/suitability, /api/explain and /api/chat. */
  simulationId: string;
  mode: 'B';
  productType: 'ELN' | 'DCD' | 'CPN';
  level: SimulateLevel;
  shock: { pct: number; shockedLevel: number };
  result: {
    /** Amount received at maturity, in the deposit currency for DCD. */
    payoff: number;
    /** Percent number, relative to the amount invested. */
    returnPct: number;
    /** max(invested − payoff, 0). */
    lossAmount: number;
    /** `null` when the product has no barrier. */
    knockedIn: boolean | null;
    /** Product-specific engine output. */
    details: Record<string, number | string | boolean | null>;
  };
  /** Payoff at each shock in PAYOFF_CURVE_SHOCKS, from the same starting level (payoff chart). */
  curve: ShockOutcome[];
  /** Payoff at each shock in SCENARIO_SHOCKS (PRD §7.1 scenario comparison table). */
  scenarios: ShockOutcome[];
  /** Where the outcome flips between loss and no loss, scanned from −99% to +100%. */
  breakevens: BreakevenPoint[];
}

/**
 * A breakeven: the underlying move at which the outcome changes between loss and no loss.
 * Empty list: no loss anywhere in the scanned range (e.g. full capital protection), or a loss
 * everywhere in it. At a barrier cliff it is the barrier itself.
 */
export interface BreakevenPoint {
  shockPct: number;
  /** Starting level × (1 + shock). */
  level: number;
}

/** One shocked outcome, computed by the same engines as `result`. */
export interface ShockOutcome {
  shockPct: number;
  level: number;
  payoff: number;
  returnPct: number;
  lossAmount: number;
  knockedIn: boolean | null;
}

/** −50% … +50% in 5% steps. */
export const PAYOFF_CURVE_SHOCKS: readonly number[] = Array.from(
  { length: 21 },
  (_, i) => -50 + i * 5,
);
/** PRD §7.1: scenario comparison table. */
export const SCENARIO_SHOCKS: readonly number[] = [-25, -10, 0, 15];

// ---- Mode A ----

const modeA = {
  mode: z.literal('A'),
  trainingWindowYears: z
    .number()
    .min(TRAINING_WINDOW_YEARS_MIN)
    .max(TRAINING_WINDOW_YEARS_MAX)
    .default(DEFAULT_TRAINING_WINDOW_YEARS),
};

/**
 * Mode A forecasts the underlying (ELN, CPN) or the FX pair (DCD, symbol `fxForecastSymbol`,
 * asset class `fx`). The forecast service decides which underlyings it supports.
 */
export const simulateModeARequestSchema = z.discriminatedUnion('productType', [
  z.strictObject({ ...modeA, productType: z.literal('ELN'), terms: elnTermsSchema }),
  z.strictObject({ ...modeA, productType: z.literal('DCD'), terms: dcdTermsSchema }),
  z.strictObject({ ...modeA, productType: z.literal('CPN'), terms: cpnTermsSchema }),
]);

export type SimulateModeARequest = z.output<typeof simulateModeARequestSchema>;

export interface ModeACaseResult {
  percentile: number;
  /** S_T, the last value of the case path. */
  terminal: number;
  /** Lowest level on the case path (an American barrier is tested against the whole path). */
  pathMin: number;
  payoff: number;
  /** Percent number, relative to the amount invested (notional or deposit amount). */
  returnPct: number;
  lossAmount: number;
  /** `null` when the product has no barrier. */
  knockedIn: boolean | null;
  details: Record<string, number | string | boolean | null>;
}

export interface SimulateModeAResponse {
  /** Id for /api/suitability, /api/explain and /api/chat. */
  simulationId: string;
  mode: 'A';
  productType: 'ELN' | 'DCD' | 'CPN';
  /** Starting level the forecast was run from, with the date of that close. */
  spot: { value: number; asOf: string };
  horizon: { tenorDays: number; tradingDays: number };
  cases: { low: ModeACaseResult; base: ModeACaseResult; high: ModeACaseResult };
  /** Across the sample paths. Probabilities are fractions (0.17 = 17%). */
  distribution: {
    pathCount: number;
    probabilityOfLoss: number;
    /** `null` when the product has no barrier. */
    probabilityOfKnockIn: number | null;
    payoffQuantiles: { p5: number; p50: number; p95: number };
  };
  /** P5 / P50 / P95 of the underlying at each trading day; index 0 is the spot. */
  fan: { p5: number[]; p50: number[]; p95: number[] };
  model: {
    name: string;
    version: string;
    simulations: number;
    drift: { method: string; annualized: number };
    trainingWindowYears: number;
    trainingStart: string;
    trainingEnd: string;
    observations: number;
  };
  backtest: {
    horizonTradingDays: number;
    windows: number;
    bandCoverage: number;
    baseMape: number;
    naiveMape: number;
  };
  /**
   * Payoff at maturity if the underlying ended at each shock from the spot (same engines and
   * shocks as Mode B, terminal level only): the payoff chart for Mode A.
   */
  curve: ShockOutcome[];
  /** PRD §7.1 scenario comparison table, from the spot. */
  scenarios: ShockOutcome[];
  breakevens: BreakevenPoint[];
  /** Recent daily closes for the fan chart, or why they are not shown. Display only. */
  history: PriceHistory;
  notice: string;
}

/**
 * Daily closes up to the forecast's as-of date (holidays skipped, never filled). `unavailable`
 * when no history provider is configured, it failed, or its last close does not match the
 * forecast's spot (a different source): nothing is substituted.
 */
export type PriceHistory =
  | { status: 'ok'; source: string; points: Array<{ date: string; close: number }> }
  | { status: 'unavailable'; reason: string };
