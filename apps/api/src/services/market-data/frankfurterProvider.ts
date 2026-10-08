import { z } from 'zod';
import { createTtlCache, deepFreeze } from '../../utils/ttlCache.js';
import { MarketDataError, type FxRateProvider, type LevelQuote } from './types.js';

export interface FrankfurterConfig {
  /** e.g. https://api.frankfurter.dev */
  apiUrl: string;
  /** Reject a rate dated more than this many days before today (weekends and holidays need slack). */
  maxAgeDays: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** How long a rate is reused per pair; it is an end-of-day rate. 0 turns it off. Default 1 hour. */
  cacheMs?: number;
}

export const DEFAULT_FX_CACHE_MS = 60 * 60 * 1000;

// GET {apiUrl}/v2/rate/{base}/{quote} → { date: "YYYY-MM-DD", base, quote, rate }
const rateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  base: z.string(),
  quote: z.string(),
  rate: z.number().positive().finite(),
});

const DAY_MS = 86_400_000;

/** Daily FX reference rate (indicative, end of day). Not a live or executable rate. */
export function createFrankfurterProvider(config: FrankfurterConfig): FxRateProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const now = config.now ?? (() => new Date());
  const cache = createTtlCache<LevelQuote>({
    ttlMs: config.cacheMs ?? DEFAULT_FX_CACHE_MS,
    maxEntries: 64,
    now: () => now().getTime(),
  });

  async function fetchRate(base: string, quote: string): Promise<LevelQuote> {
    const root = config.apiUrl.replace(/\/+$/, '');
    const url = `${root}/v2/rate/${base.toLowerCase()}/${quote.toLowerCase()}`;
    let res: Response;
    try {
      res = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
      });
    } catch {
      throw new MarketDataError('FX rate service is unreachable or timed out');
    }
    if (!res.ok) {
      throw new MarketDataError(`FX rate service returned HTTP ${res.status} for ${base}/${quote}`);
    }

    const parsed = rateSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) {
      throw new MarketDataError('FX rate service returned an unexpected response');
    }
    const body = parsed.data;
    if (
      body.base.toUpperCase() !== base.toUpperCase() ||
      body.quote.toUpperCase() !== quote.toUpperCase()
    ) {
      throw new MarketDataError(
        `FX rate service answered for ${body.base}/${body.quote}, not ${base}/${quote}`,
      );
    }

    const ageDays = (now().getTime() - Date.parse(`${body.date}T00:00:00Z`)) / DAY_MS;
    if (ageDays > config.maxAgeDays) {
      throw new MarketDataError(
        `FX rate for ${base}/${quote} is stale (dated ${body.date}). Enter the rate manually.`,
      );
    }
    return { value: body.rate, source: 'reference', asOf: body.date };
  }

  return {
    // A cached rate is shared between requests, so it is frozen against changes in place.
    getRate: (base, quote) =>
      cache.get(`${base}/${quote}`.toUpperCase(), async () =>
        deepFreeze(await fetchRate(base, quote)),
      ),
  };
}
