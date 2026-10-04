// Builds the market-data providers from configuration. Live levels come from Finnhub when
// FINNHUB_API_KEY is set (MVP), otherwise from Upstox when UPSTOX_ACCESS_TOKEN is set (future
// scope). With neither, `level.source: "live"` fails with MARKET_DATA_UNAVAILABLE.

import type { AppConfig } from '../../config/index.js';
import type { Logger } from '../../utils/logger.js';
import { createFinnhubFeed } from './finnhub/finnhubFeed.js';
import { createFinnhubLevelProvider, createFinnhubStream } from './finnhub/finnhubLevelProvider.js';
import { createFrankfurterProvider } from './frankfurterProvider.js';
import { createMarketDataService, type MarketDataService } from './marketDataService.js';
import type { LiveLevelProvider, LiveStream } from './types.js';
import { createUpstoxFeed } from './upstox/upstoxFeed.js';
import { createUpstoxLevelProvider } from './upstox/upstoxLevelProvider.js';

export interface MarketData {
  service: MarketDataService;
  /** Live prices for the /api/live websocket; absent when the provider has no stream. */
  stream?: LiveStream;
  /** Closes the live feed connection, if one was created. */
  close(): void;
}

export function createMarketData(config: AppConfig, logger: Logger): MarketData {
  const { finnhub, upstox, maxAgeSeconds, fx } = config.marketData;
  const log = (message: string) => logger.info(message);
  const maxAgeMs = maxAgeSeconds * 1000;
  let live: LiveLevelProvider | undefined;
  let stream: LiveStream | undefined;
  let close: () => void = () => undefined;

  if (finnhub.apiKey) {
    const feed = createFinnhubFeed({ apiKey: finnhub.apiKey, wsUrl: finnhub.wsUrl, log });
    live = createFinnhubLevelProvider({ feed, maxAgeMs });
    stream = createFinnhubStream(feed);
    close = () => feed.close();
  } else if (upstox.accessToken) {
    const feed = createUpstoxFeed({ accessToken: upstox.accessToken, apiUrl: upstox.apiUrl, log });
    live = createUpstoxLevelProvider({ feed, maxAgeMs });
    close = () => feed.close();
  }

  return {
    service: createMarketDataService({
      live,
      fx: createFrankfurterProvider({ apiUrl: fx.apiUrl, maxAgeDays: fx.maxAgeDays }),
    }),
    stream,
    close,
  };
}
