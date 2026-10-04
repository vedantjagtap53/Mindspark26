// Recent closes shown before the Mode A forecast fan (PRD §7.1). Display only: the forecast and
// every payoff come from the forecast service's own data. History from another source is shown
// only when its close on the forecast's as-of date matches the forecast spot, so the chart never
// joins two series that disagree.

import type { PriceHistory, UnderlyingAssetClass } from '@mindspark/shared';
import type { HistoryProvider } from '../market-data/history/yahooHistoryProvider.js';

/** History length in trading days: the forecast horizon, at least 60 and at most 252. */
export const historyLength = (tradingDays: number) => Math.min(252, Math.max(60, tradingDays));

/** Relative difference allowed between the history close and the forecast spot on the as-of date. */
export const SPOT_MATCH_TOLERANCE = 5e-4;

const DAY_MS = 86_400_000;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Starts the history request; call `.match()` once the forecast's spot and date are known. */
export function requestFanHistory(
  provider: HistoryProvider | undefined,
  underlying: { symbol: string; assetClass: UnderlyingAssetClass },
  tradingDays: number,
  now: () => number = Date.now,
) {
  const length = historyLength(tradingDays);
  // Calendar days for `length` trading days, plus slack for holidays.
  const from = isoDate(now() - Math.ceil((length * 365) / 252 + 30) * DAY_MS);
  const pending = provider
    ? provider.dailyCloses(underlying, from, isoDate(now())).then(
        (points) => ({ points }),
        (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }),
      )
    : Promise.resolve({ error: 'No price history provider is configured' });

  return {
    async match(spot: number, asOf: string): Promise<PriceHistory> {
      if (!provider) {
        return { status: 'unavailable', reason: 'No price history provider is configured' };
      }
      const got = await pending;
      if ('error' in got) return { status: 'unavailable', reason: got.error };
      const points = got.points.filter((p) => p.date <= asOf).slice(-length - 1);
      const last = points[points.length - 1];
      if (!last || last.date !== asOf) {
        return {
          status: 'unavailable',
          reason: `${provider.name} has no close for ${asOf}, the forecast's last data day`,
        };
      }
      if (Math.abs(last.close - spot) / spot > SPOT_MATCH_TOLERANCE) {
        return {
          status: 'unavailable',
          reason: `${provider.name} close on ${asOf} (${last.close}) does not match the forecast spot (${spot})`,
        };
      }
      return { status: 'ok', source: provider.name, points };
    },
  };
}
