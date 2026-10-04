// Zod schemas for the Mode A forecast contract. Mirrors docs/forecasting.md.
// Structural checks live in the schemas; cross-field checks that depend on the
// request (tenor, sample count, staleness) live in `validateForecastResponse`.

import { z } from 'zod';
import {
  DEFAULT_SAMPLE_PATH_COUNT,
  DEFAULT_TRAINING_WINDOW_YEARS,
  FORECAST_CASE_PERCENTILES,
  FORECAST_CONTRACT_VERSION,
  FORECAST_MAX_STALENESS_DAYS,
  SAMPLE_PATH_COUNT_MAX,
  SAMPLE_PATH_COUNT_MIN,
  TENOR_DAYS_MAX,
  TENOR_DAYS_MIN,
  UNDERLYING_ASSET_CLASSES,
  tenorToTradingDays,
} from '../constants/forecast.js';

const price = z.number().finite().positive();
const series = z.array(price).min(2);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const forecastRequestSchema = z.object({
  underlying: z.object({
    symbol: z.string().trim().min(1),
    assetClass: z.enum(UNDERLYING_ASSET_CLASSES),
  }),
  tenorDays: z.number().int().min(TENOR_DAYS_MIN).max(TENOR_DAYS_MAX),
  trainingWindowYears: z
    .union([z.literal(5), z.literal(10)])
    .default(DEFAULT_TRAINING_WINDOW_YEARS),
  samplePathCount: z
    .number()
    .int()
    .min(SAMPLE_PATH_COUNT_MIN)
    .max(SAMPLE_PATH_COUNT_MAX)
    .default(DEFAULT_SAMPLE_PATH_COUNT),
});
export type ForecastRequestInput = z.input<typeof forecastRequestSchema>;
export type ForecastRequest = z.output<typeof forecastRequestSchema>;

const caseSchema = (percentile: number) =>
  z.object({ percentile: z.literal(percentile), path: series });

export const forecastResponseSchema = z.object({
  contractVersion: z.literal(FORECAST_CONTRACT_VERSION),
  model: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    simulations: z.number().int().min(10000),
    drift: z.object({
      method: z.string().min(1),
      annualized: z.number().finite(),
    }),
  }),
  data: z.object({
    symbol: z.string().min(1),
    asOf: isoDate,
    trainingStart: isoDate,
    trainingEnd: isoDate,
    observations: z.number().int().positive(),
    spot: price,
  }),
  horizon: z.object({
    tenorDays: z.number().int(),
    tradingDays: z.number().int().positive(),
  }),
  cases: z.object({
    low: caseSchema(FORECAST_CASE_PERCENTILES.low),
    base: caseSchema(FORECAST_CASE_PERCENTILES.base),
    high: caseSchema(FORECAST_CASE_PERCENTILES.high),
  }),
  terminalQuantiles: z.object({ p5: price, p50: price, p95: price }),
  fan: z.object({ p5: series, p50: series, p95: series }),
  samplePaths: z.array(series).min(1),
  backtest: z.object({
    horizonTradingDays: z.number().int().positive(),
    windows: z.number().int().nonnegative(),
    bandCoverage: z.number().min(0).max(1),
    baseMape: z.number().finite().nonnegative(),
    naiveMape: z.number().finite().nonnegative(),
  }),
});
export type ForecastResponse = z.infer<typeof forecastResponseSchema>;

export interface ForecastValidationIssue {
  path: string;
  message: string;
}

const DAY_MS = 86_400_000;
const SPOT_TOLERANCE = 1e-6;

/**
 * Parse and validate a raw forecast response against the request that produced it.
 * Returns the typed response or the list of issues; never throws on bad input.
 */
export function validateForecastResponse(
  raw: unknown,
  request: ForecastRequest,
  now: Date = new Date(),
): { ok: true; value: ForecastResponse } | { ok: false; issues: ForecastValidationIssue[] } {
  const parsed = forecastResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }
  const f = parsed.data;
  const issues: ForecastValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  const expectedSteps = tenorToTradingDays(request.tenorDays);
  if (f.horizon.tenorDays !== request.tenorDays) {
    add('horizon.tenorDays', `expected ${request.tenorDays}, got ${f.horizon.tenorDays}`);
  }
  if (f.horizon.tradingDays !== expectedSteps) {
    add('horizon.tradingDays', `expected ${expectedSteps}, got ${f.horizon.tradingDays}`);
  }
  if (f.data.symbol !== request.underlying.symbol) {
    add('data.symbol', `expected ${request.underlying.symbol}, got ${f.data.symbol}`);
  }

  const len = expectedSteps + 1;
  const checkSeries = (path: string, s: number[]) => {
    if (s.length !== len) add(path, `expected ${len} values, got ${s.length}`);
    else if (Math.abs(s[0]! - f.data.spot) > SPOT_TOLERANCE * f.data.spot) {
      add(`${path}.0`, 'first value must equal data.spot');
    }
  };
  checkSeries('cases.low.path', f.cases.low.path);
  checkSeries('cases.base.path', f.cases.base.path);
  checkSeries('cases.high.path', f.cases.high.path);
  checkSeries('fan.p5', f.fan.p5);
  checkSeries('fan.p50', f.fan.p50);
  checkSeries('fan.p95', f.fan.p95);

  if (f.samplePaths.length !== request.samplePathCount) {
    add('samplePaths', `expected ${request.samplePathCount} paths, got ${f.samplePaths.length}`);
  }
  // Report at most one bad sample path to keep the error small.
  const badSample = f.samplePaths.findIndex(
    (s) => s.length !== len || Math.abs(s[0]! - f.data.spot) > SPOT_TOLERANCE * f.data.spot,
  );
  if (badSample >= 0) add(`samplePaths.${badSample}`, `expected ${len} values starting at spot`);

  const q = f.terminalQuantiles;
  if (!(q.p5 <= q.p50 && q.p50 <= q.p95)) add('terminalQuantiles', 'must satisfy p5 <= p50 <= p95');

  const last = (s: number[]) => s[s.length - 1]!;
  if (!(
    last(f.cases.low.path) <= last(f.cases.base.path) &&
    last(f.cases.base.path) <= last(f.cases.high.path)
  )) {
    add('cases', 'final values must satisfy low <= base <= high');
  }

  if (f.data.trainingStart >= f.data.trainingEnd) {
    add('data.trainingStart', 'must be before trainingEnd');
  }

  const ageDays = (now.getTime() - Date.parse(`${f.data.asOf}T00:00:00Z`)) / DAY_MS;
  if (ageDays > FORECAST_MAX_STALENESS_DAYS) {
    add('data.asOf', `forecast data is ${Math.floor(ageDays)} days old`);
  }
  if (ageDays < -1) add('data.asOf', 'asOf is in the future');

  return issues.length ? { ok: false, issues } : { ok: true, value: f };
}
