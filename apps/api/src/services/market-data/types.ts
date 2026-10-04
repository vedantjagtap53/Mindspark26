import type { LevelSource } from '@mindspark/shared';
import { AppError } from '../../utils/errors.js';

/** A starting level with provenance. Market data is never invented: a provider returns a quote or throws. */
export interface LevelQuote {
  value: number;
  source: LevelSource;
  /** ISO timestamp or date of the value; `null` for RM-entered values. */
  asOf: string | null;
}

export interface LiveLevelProvider {
  /** Latest level for an underlying symbol such as `^NSEI`. Throws if unavailable or stale. */
  getLevel(symbol: string): Promise<LevelQuote>;
}

/** Live prices for display (the /api/live websocket). Simulations use LiveLevelProvider instead. */
export interface LiveStream {
  /** Shown to the RM, e.g. "Finnhub". */
  provider: string;
  /** Stream quotes for a symbol until the returned function is called. Throws if unavailable. */
  watch(symbol: string, onQuote: (quote: LevelQuote) => void): Promise<() => void>;
}

export interface FxRateProvider {
  /** Latest daily rate in `quote` units per 1 `base` unit. Throws if unavailable or stale. */
  getRate(base: string, quote: string): Promise<LevelQuote>;
}

export class MarketDataError extends AppError {
  constructor(message: string) {
    super('MARKET_DATA_UNAVAILABLE', message);
    this.name = 'MarketDataError';
  }
}
