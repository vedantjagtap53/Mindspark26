import type { SimulateModeBRequest } from '@mindspark/shared';
import {
  MarketDataError,
  type FxRateProvider,
  type LevelQuote,
  type LiveLevelProvider,
} from './types.js';

export interface MarketDataService {
  /** Resolve the starting level (S_0 or FX spot) the RM asked for. Never substitutes another source. */
  resolveLevel(request: SimulateModeBRequest): Promise<LevelQuote>;
}

export interface MarketDataDeps {
  /** Absent when no live feed is configured. */
  live?: LiveLevelProvider;
  fx?: FxRateProvider;
}

export function createMarketDataService(deps: MarketDataDeps): MarketDataService {
  return {
    async resolveLevel(request) {
      const { level } = request;
      if (level.source === 'manual') return { value: level.value, source: 'manual', asOf: null };

      if (level.source === 'live') {
        if (!deps.live) {
          throw new MarketDataError('Live market data is not configured: enter the level manually');
        }
        if (request.productType === 'DCD') {
          throw new MarketDataError('Live level does not apply to DCD');
        }
        return deps.live.getLevel(request.terms.underlying.symbol);
      }

      if (!deps.fx) {
        throw new MarketDataError('FX reference rates are not configured: enter the rate manually');
      }
      if (request.productType !== 'DCD') {
        throw new MarketDataError('Reference rate only applies to DCD');
      }
      return deps.fx.getRate(request.terms.depositCurrency, request.terms.alternateCurrency);
    },
  };
}
