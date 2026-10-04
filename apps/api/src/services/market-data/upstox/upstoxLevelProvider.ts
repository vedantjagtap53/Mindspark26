import { AppError } from '../../../utils/errors.js';
import { MarketDataError, type LevelQuote, type LiveLevelProvider } from '../types.js';
import type { UpstoxFeed } from './upstoxFeed.js';

/** Underlying symbol → Upstox instrument key. Only Nifty 50 is wired so far; others need the instrument list. */
export const UPSTOX_INSTRUMENT_KEYS: Readonly<Record<string, string>> = {
  '^NSEI': 'NSE_INDEX|Nifty 50',
};

export interface UpstoxLevelProviderConfig {
  feed: UpstoxFeed;
  /** Reject a price whose last-trade time is older than this. */
  maxAgeMs: number;
  now?: () => Date;
}

/** Live level from the Upstox feed. A price older than `maxAgeMs` (e.g. outside market hours) is rejected, never reused. */
export function createUpstoxLevelProvider(config: UpstoxLevelProviderConfig): LiveLevelProvider {
  const now = config.now ?? (() => new Date());
  return {
    async getLevel(symbol): Promise<LevelQuote> {
      const key = UPSTOX_INSTRUMENT_KEYS[symbol];
      if (!key) {
        throw new AppError(
          'VALIDATION_ERROR',
          `No live price feed for ${symbol}: enter the level manually`,
          [
            {
              path: 'terms.underlying.symbol',
              message: 'live level is not available for this symbol',
            },
          ],
        );
      }
      const tick = await config.feed.getTick(key);
      if (tick.ltt <= 0) throw new MarketDataError(`Upstox sent no trade time for ${symbol}`);
      const ageMs = now().getTime() - tick.ltt;
      if (ageMs > config.maxAgeMs) {
        throw new MarketDataError(
          `Live level for ${symbol} is stale (last trade ${new Date(tick.ltt).toISOString()}); ` +
            'the market may be closed. Enter the level manually.',
        );
      }
      return { value: tick.ltp, source: 'live', asOf: new Date(tick.ltt).toISOString() };
    },
  };
}
