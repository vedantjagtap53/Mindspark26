// Live level and live stream backed by the Finnhub feed. Symbols are Finnhub's own (e.g. AAPL,
// BINANCE:BTCUSDT). Index symbols such as ^NSEI are not streamed by Finnhub and are refused.
import {
  MarketDataError,
  type LevelQuote,
  type LiveLevelProvider,
  type LiveStream,
} from '../types.js';
import type { FinnhubFeed, FinnhubTrade } from './finnhubFeed.js';

const quoteOf = (trade: FinnhubTrade): LevelQuote => ({
  value: trade.price,
  source: 'live',
  asOf: new Date(trade.time).toISOString(),
});

function checkSymbol(symbol: string): void {
  if (symbol.startsWith('^')) {
    throw new MarketDataError(
      `Finnhub does not stream index ${symbol}: use a covered symbol (e.g. AAPL) or enter the level manually`,
    );
  }
}

export interface FinnhubLevelProviderConfig {
  feed: FinnhubFeed;
  /** Reject a trade older than this (e.g. the market is closed). */
  maxAgeMs: number;
  now?: () => Date;
}

/** A trade older than `maxAgeMs` is rejected, never reused as the current level. */
export function createFinnhubLevelProvider(config: FinnhubLevelProviderConfig): LiveLevelProvider {
  const now = config.now ?? (() => new Date());
  return {
    async getLevel(symbol) {
      checkSymbol(symbol);
      const trade = await config.feed.getTrade(symbol);
      if (now().getTime() - trade.time > config.maxAgeMs) {
        throw new MarketDataError(
          `Live level for ${symbol} is stale (last trade ${new Date(trade.time).toISOString()}); ` +
            'the market may be closed. Enter the level manually.',
        );
      }
      return quoteOf(trade);
    },
  };
}

export function createFinnhubStream(feed: FinnhubFeed): LiveStream {
  return {
    provider: 'Finnhub',
    async watch(symbol, onQuote) {
      checkSymbol(symbol);
      return feed.watch(symbol, (trade) => onQuote(quoteOf(trade)));
    },
  };
}
