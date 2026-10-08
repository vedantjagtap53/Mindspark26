// Forecast (Mode A) constants. Source: PRD.md §3 and §7.3, docs/forecasting.md.

export const FORECAST_CONTRACT_VERSION = '1.0';

export const TENOR_DAYS_MIN = 30;
export const TENOR_DAYS_MAX = 1095;

export const TRADING_DAYS_PER_YEAR = 252;
export const CALENDAR_DAYS_PER_YEAR = 365;

/** Training window the RM picks (PRD.md §7.1, §7.3): 30 days to 3 years, sent to the forecast as years. */
export const TRAINING_WINDOW_DAYS_MIN = 30;
export const TRAINING_WINDOW_DAYS_MAX = 1095;
export const TRAINING_WINDOW_YEARS_MIN = TRAINING_WINDOW_DAYS_MIN / CALENDAR_DAYS_PER_YEAR;
export const TRAINING_WINDOW_YEARS_MAX = TRAINING_WINDOW_DAYS_MAX / CALENDAR_DAYS_PER_YEAR;
export type TrainingWindowYears = number;
export const DEFAULT_TRAINING_WINDOW_YEARS: TrainingWindowYears = TRAINING_WINDOW_YEARS_MAX;

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

/**
 * Forecast symbol for a DCD currency pair: deposit then alternate currency, e.g. `USDINR`, quoted
 * as units of the alternate currency per 1 unit of the deposit currency (the DCD strike's quote,
 * docs/product-formulas.md). Proposed convention: the forecast service must accept it
 * (assetClass `fx`) before Mode A works for DCD.
 */
export function fxForecastSymbol(depositCurrency: string, alternateCurrency: string): string {
  return `${depositCurrency.toUpperCase()}${alternateCurrency.toUpperCase()}`;
}
