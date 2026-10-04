// Forecast (Mode A) constants. Source: PRD.md §3 and §7.3, docs/forecasting.md.

export const FORECAST_CONTRACT_VERSION = '1.0';

export const TENOR_DAYS_MIN = 30;
export const TENOR_DAYS_MAX = 1095;

export const TRADING_DAYS_PER_YEAR = 252;
export const CALENDAR_DAYS_PER_YEAR = 365;

export const TRAINING_WINDOW_YEARS = [5, 10] as const;
export type TrainingWindowYears = (typeof TRAINING_WINDOW_YEARS)[number];
export const DEFAULT_TRAINING_WINDOW_YEARS: TrainingWindowYears = 10;

export const SAMPLE_PATH_COUNT_MIN = 100;
export const SAMPLE_PATH_COUNT_MAX = 2000;
export const DEFAULT_SAMPLE_PATH_COUNT = 500;

export const FORECAST_CASE_PERCENTILES = { low: 5, base: 50, high: 95 } as const;
export type ForecastCase = keyof typeof FORECAST_CASE_PERCENTILES;

/** Maximum age of the forecast's last data point, in calendar days. */
export const FORECAST_MAX_STALENESS_DAYS = 5;

export const UNDERLYING_ASSET_CLASSES = ['index', 'equity', 'fx'] as const;
export type UnderlyingAssetClass = (typeof UNDERLYING_ASSET_CLASSES)[number];

/** Calendar-day tenor → number of simulation steps (trading days). */
export function tenorToTradingDays(tenorDays: number): number {
  return Math.round((tenorDays * TRADING_DAYS_PER_YEAR) / CALENDAR_DAYS_PER_YEAR);
}
