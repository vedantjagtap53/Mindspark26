// Daily closes for the Mode A fan chart (PRD §7.1 "recent history", §7.2 market data service), from
// the Yahoo Finance chart API: free and keyless, but unofficial (no SLA; Yahoo's terms apply), so it
// is off unless MARKET_HISTORY_PROVIDER=yahoo. Days without a close (holidays) are skipped, never
// filled. Display only: no payoff or forecast uses these values.

import { z } from 'zod';
import type { UnderlyingAssetClass } from '@mindspark/shared';
import { MarketDataError } from '../types.js';

export interface HistoryPoint {
  /** Exchange-local trading date, YYYY-MM-DD. */
  date: string;
  close: number;
}

export interface HistoryProvider {
  /** Shown to the RM, e.g. "Yahoo Finance". */
  name: string;
  /** Daily closes, oldest first, from `from` to `to` inclusive (YYYY-MM-DD). Throws MarketDataError. */
  dailyCloses(
    underlying: { symbol: string; assetClass: UnderlyingAssetClass },
    from: string,
    to: string,
  ): Promise<HistoryPoint[]>;
}

export interface YahooHistoryConfig {
  apiUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Cached answers are reused for this long. Default 1 hour. */
  cacheMs?: number;
  now?: () => number;
}

const chartSchema = z.object({
  chart: z.object({
    error: z.unknown().nullish(),
    result: z
      .array(
        z.object({
          meta: z.object({ symbol: z.string(), gmtoffset: z.number().optional() }),
          timestamp: z.array(z.number()).optional(),
          indicators: z.object({
            quote: z.array(z.object({ close: z.array(z.number().nullable()) })).min(1),
          }),
        }),
      )
      .nullish(),
  }),
});

/** Yahoo's symbol: indices and equities as given (e.g. `^NSEI`), FX pairs as `USDINR=X`. */
export function yahooSymbol(symbol: string, assetClass: UnderlyingAssetClass): string {
  return assetClass === 'fx' ? `${symbol.replace(/[^A-Za-z]/g, '').toUpperCase()}=X` : symbol;
}

const toEpoch = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);

export function createYahooHistoryProvider(config: YahooHistoryConfig): HistoryProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const now = config.now ?? Date.now;
  const cacheMs = config.cacheMs ?? 60 * 60 * 1000;
  const cache = new Map<string, { at: number; points: HistoryPoint[] }>();

  return {
    name: 'Yahoo Finance',
    async dailyCloses({ symbol, assetClass }, from, to) {
      const ySymbol = yahooSymbol(symbol, assetClass);
      const key = `${ySymbol}|${from}|${to}`;
      const hit = cache.get(key);
      if (hit && now() - hit.at < cacheMs) return hit.points;

      // period2 is exclusive; a day of slack either side covers exchange time zones.
      const params = new URLSearchParams({
        period1: String(toEpoch(from) - 86_400),
        period2: String(toEpoch(to) + 2 * 86_400),
        interval: '1d',
        events: 'history',
      });
      const url = `${config.apiUrl.replace(/\/+$/, '')}/v8/finance/chart/${encodeURIComponent(ySymbol)}?${params}`;
      let res: Response;
      try {
        res = await fetchImpl(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (payoff-simulator)' },
          signal: AbortSignal.timeout(config.timeoutMs ?? 5_000),
        });
      } catch {
        throw new MarketDataError('Price history service is unreachable or timed out');
      }
      if (!res.ok) throw new MarketDataError(`Price history service returned HTTP ${res.status}`);
      const parsed = chartSchema.safeParse(await res.json().catch(() => null));
      const result = parsed.success ? parsed.data.chart.result?.[0] : undefined;
      if (!result) {
        throw new MarketDataError('Price history service returned an unexpected response');
      }
      if (result.meta.symbol.toUpperCase() !== ySymbol.toUpperCase()) {
        throw new MarketDataError(
          `Price history answered for ${result.meta.symbol}, not ${ySymbol}`,
        );
      }

      // Bars are stamped at the session open; the exchange's UTC offset gives the trading date.
      const offsetMs = (result.meta.gmtoffset ?? 0) * 1000;
      const closes = result.indicators.quote[0]!.close;
      const byDate = new Map<string, number>();
      (result.timestamp ?? []).forEach((ts, i) => {
        const close = closes[i];
        if (close === null || close === undefined || !Number.isFinite(close) || close <= 0) return;
        const date = new Date(ts * 1000 + offsetMs).toISOString().slice(0, 10);
        if (date >= from && date <= to) byDate.set(date, close);
      });
      const points = [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, close]) => ({ date, close }));
      cache.set(key, { at: now(), points });
      return points;
    },
  };
}
