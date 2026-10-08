import { describe, expect, it } from 'vitest';
import { createFrankfurterProvider } from '../../../src/services/market-data/frankfurterProvider.js';
import { MarketDataError } from '../../../src/services/market-data/types.js';
import { createUpstoxLevelProvider } from '../../../src/services/market-data/upstox/upstoxLevelProvider.js';
import type {
  UpstoxFeed,
  UpstoxTick,
} from '../../../src/services/market-data/upstox/upstoxFeed.js';
import { AppError } from '../../../src/utils/errors.js';

const NOW = new Date('2026-10-05T04:30:00Z');

function feedReturning(tick: UpstoxTick | Error) {
  const keys: string[] = [];
  const feed: UpstoxFeed = {
    getTick: (key) => {
      keys.push(key);
      return tick instanceof Error ? Promise.reject(tick) : Promise.resolve(tick);
    },
    close: () => undefined,
  };
  return { feed, keys };
}

describe('Upstox level provider', () => {
  const provider = (feed: UpstoxFeed) =>
    createUpstoxLevelProvider({ feed, maxAgeMs: 120_000, now: () => NOW });

  it('maps ^NSEI to the Nifty 50 index key and returns a timestamped live quote', async () => {
    const ltt = NOW.getTime() - 5_000;
    const { feed, keys } = feedReturning({ ltp: 25_100.25, ltt });
    const quote = await provider(feed).getLevel('^NSEI');
    expect(keys).toEqual(['NSE_INDEX|Nifty 50']);
    expect(quote).toEqual({ value: 25_100.25, source: 'live', asOf: new Date(ltt).toISOString() });
  });

  it('accepts a price exactly at the age limit', async () => {
    const { feed } = feedReturning({ ltp: 1, ltt: NOW.getTime() - 120_000 });
    await expect(provider(feed).getLevel('^NSEI')).resolves.toMatchObject({ value: 1 });
  });

  it('rejects a stale price (market closed) instead of reusing it', async () => {
    const { feed } = feedReturning({ ltp: 25_000, ltt: NOW.getTime() - 120_001 });
    const err = await provider(feed)
      .getLevel('^NSEI')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MarketDataError);
    expect((err as Error).message).toMatch(/stale/);
  });

  it('rejects a tick without a trade time', async () => {
    const { feed } = feedReturning({ ltp: 25_000, ltt: 0 });
    await expect(provider(feed).getLevel('^NSEI')).rejects.toThrow(/no trade time/);
  });

  it('rejects symbols with no live mapping as a validation error', async () => {
    const { feed, keys } = feedReturning({ ltp: 1, ltt: NOW.getTime() });
    const err = await provider(feed)
      .getLevel('RELIANCE.NS')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('VALIDATION_ERROR');
    expect(keys).toEqual([]);
  });

  it('propagates feed failures', async () => {
    const { feed } = feedReturning(new MarketDataError('feed down'));
    await expect(provider(feed).getLevel('^NSEI')).rejects.toThrow('feed down');
  });
});

describe('Frankfurter provider', () => {
  const calls: string[] = [];
  const respond = (body: unknown, status = 200) =>
    ((url: string) => {
      calls.push(url);
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }) as unknown as typeof fetch;
  const provider = (fetchImpl: typeof fetch, maxAgeDays = 4) =>
    createFrankfurterProvider({
      apiUrl: 'https://fx.example/',
      maxAgeDays,
      fetchImpl,
      now: () => NOW,
    });
  const body = { date: '2026-10-02', base: 'USD', quote: 'INR', rate: 96.15 };

  it('returns the dated reference rate', async () => {
    calls.length = 0;
    const quote = await provider(respond(body)).getRate('USD', 'INR');
    expect(quote).toEqual({ value: 96.15, source: 'reference', asOf: '2026-10-02' });
    expect(calls).toEqual(['https://fx.example/v2/rate/usd/inr']);
  });

  it('reuses a pair’s rate instead of asking again, and never keeps a failure', async () => {
    calls.length = 0;
    const fx = provider(respond(body));
    await fx.getRate('USD', 'INR');
    expect(await fx.getRate('usd', 'inr')).toEqual({
      value: 96.15,
      source: 'reference',
      asOf: '2026-10-02',
    });
    expect(calls).toHaveLength(1);

    calls.length = 0;
    let status = 503;
    const flaky = provider(((url: string) => {
      calls.push(url);
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }) as unknown as typeof fetch);
    await expect(flaky.getRate('USD', 'INR')).rejects.toThrow(/HTTP 503/);
    status = 200;
    await expect(flaky.getRate('USD', 'INR')).resolves.toBeDefined();
    expect(calls).toHaveLength(2);
  });

  it('accepts a weekend-old rate within the age limit', async () => {
    await expect(
      provider(respond({ ...body, date: '2026-10-02' })).getRate('USD', 'INR'),
    ).resolves.toBeDefined();
  });

  it('rejects a rate older than the limit', async () => {
    await expect(
      provider(respond({ ...body, date: '2026-09-30' })).getRate('USD', 'INR'),
    ).rejects.toThrow(/stale/);
  });

  it('rejects HTTP errors, network errors and malformed bodies', async () => {
    await expect(provider(respond({}, 503)).getRate('USD', 'INR')).rejects.toThrow(/HTTP 503/);
    const offline = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    await expect(provider(offline).getRate('USD', 'INR')).rejects.toThrow(/unreachable/);
    await expect(provider(respond({ rate: 'abc' })).getRate('USD', 'INR')).rejects.toThrow(
      /unexpected response/,
    );
    await expect(provider(respond({ ...body, rate: 0 })).getRate('USD', 'INR')).rejects.toThrow(
      /unexpected response/,
    );
  });

  it('rejects an answer for a different currency pair', async () => {
    await expect(
      provider(respond({ ...body, quote: 'EUR' })).getRate('USD', 'INR'),
    ).rejects.toThrow(/not USD\/INR/);
  });
});
