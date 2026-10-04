import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  createFinnhubFeed,
  type FinnhubSocket,
} from '../../../src/services/market-data/finnhub/finnhubFeed.js';
import {
  createFinnhubLevelProvider,
  createFinnhubStream,
} from '../../../src/services/market-data/finnhub/finnhubLevelProvider.js';
import { MarketDataError } from '../../../src/services/market-data/types.js';

const T0 = Date.parse('2026-10-05T14:30:00Z');
const tick = () => new Promise((r) => setImmediate(r));

class FakeSocket extends EventEmitter implements FinnhubSocket {
  sent: Array<Record<string, unknown>> = [];
  constructor(readonly url: string) {
    super();
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close() {
    this.emit('close');
  }
  trade(symbol: string, price: number, time = T0) {
    const frame = { type: 'trade', data: [{ s: symbol, p: price, t: time, v: 1 }] };
    this.emit('message', Buffer.from(JSON.stringify(frame)));
  }
}

function setup(opts: { open?: boolean } = {}) {
  const sockets: FakeSocket[] = [];
  const feed = createFinnhubFeed({
    apiKey: 'SECRET KEY',
    wsUrl: 'wss://ws.example/',
    tradeTimeoutMs: 50,
    connectTimeoutMs: 200,
    reconnectDelayMs: 10,
    socketFactory: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      setImmediate(() =>
        opts.open === false
          ? s.emit('error', new Error('Unexpected server response: 401'))
          : s.emit('open'),
      );
      return s;
    },
  });
  return { feed, sockets };
}

describe('Finnhub feed', () => {
  it('connects with the encoded key, subscribes, and returns the next trade', async () => {
    const { feed, sockets } = setup();
    const pending = feed.getTrade('AAPL');
    await tick();
    await tick();
    sockets[0]!.trade('AAPL', 231.5);

    expect(await pending).toEqual({ price: 231.5, time: T0 });
    expect(sockets[0]!.url).toBe('wss://ws.example?token=SECRET%20KEY');
    expect(sockets[0]!.sent).toEqual([{ type: 'subscribe', symbol: 'AAPL' }]);
    feed.close();
  });

  it('serves the cached latest trade without resubscribing, and ignores out-of-order trades', async () => {
    const { feed, sockets } = setup();
    const first = feed.getTrade('AAPL');
    await tick();
    await tick();
    sockets[0]!.trade('AAPL', 230, T0);
    await first;
    sockets[0]!.trade('AAPL', 229, T0 - 1000);

    expect(await feed.getTrade('AAPL')).toEqual({ price: 230, time: T0 });
    expect(sockets[0]!.sent).toHaveLength(1);
    feed.close();
  });

  it('fails clearly when no trade arrives (market closed or symbol not covered)', async () => {
    const { feed } = setup();
    await expect(feed.getTrade('AAPL')).rejects.toThrow(/No trades for AAPL/);
    feed.close();
  });

  it('reports a rejected handshake as a bad API key', async () => {
    const { feed } = setup({ open: false });
    await expect(feed.getTrade('AAPL')).rejects.toThrow(/FINNHUB_API_KEY/);
    feed.close();
  });

  it('streams trades to watchers and unsubscribes when the last one stops', async () => {
    const { feed, sockets } = setup();
    const seen: number[] = [];
    const stop = await feed.watch('BINANCE:BTCUSDT', (t) => seen.push(t.price));
    sockets[0]!.trade('BINANCE:BTCUSDT', 100);
    sockets[0]!.trade('OTHER', 1);
    sockets[0]!.trade('BINANCE:BTCUSDT', 101, T0 + 1);
    stop();

    expect(seen).toEqual([100, 101]);
    expect(sockets[0]!.sent).toEqual([
      { type: 'subscribe', symbol: 'BINANCE:BTCUSDT' },
      { type: 'unsubscribe', symbol: 'BINANCE:BTCUSDT' },
    ]);
    feed.close();
  });

  it('reconnects while watched, restores the subscription and drops pre-drop trades', async () => {
    const { feed, sockets } = setup();
    const seen: number[] = [];
    await feed.watch('AAPL', (t) => seen.push(t.price));
    sockets[0]!.trade('AAPL', 100);
    sockets[0]!.emit('close');

    await expect.poll(() => sockets[1]?.sent).toEqual([{ type: 'subscribe', symbol: 'AAPL' }]);
    sockets[1]!.trade('AAPL', 105, T0 + 5);
    expect(seen).toEqual([100, 105]);
    feed.close();
  });
});

describe('Finnhub level provider', () => {
  const fixedFeed = (time: number) => ({
    getTrade: () => Promise.resolve({ price: 231.5, time }),
    watch: () => Promise.resolve(() => undefined),
    close: () => undefined,
  });

  it('returns a live quote with the trade time', async () => {
    const live = createFinnhubLevelProvider({
      feed: fixedFeed(T0),
      maxAgeMs: 120_000,
      now: () => new Date(T0 + 1_000),
    });
    expect(await live.getLevel('AAPL')).toEqual({
      value: 231.5,
      source: 'live',
      asOf: new Date(T0).toISOString(),
    });
  });

  it('rejects a stale trade instead of reusing it', async () => {
    const live = createFinnhubLevelProvider({
      feed: fixedFeed(T0),
      maxAgeMs: 120_000,
      now: () => new Date(T0 + 121_000),
    });
    await expect(live.getLevel('AAPL')).rejects.toThrow(/stale/);
  });

  it('refuses index symbols Finnhub does not stream', async () => {
    const live = createFinnhubLevelProvider({ feed: fixedFeed(T0), maxAgeMs: 1 });
    await expect(live.getLevel('^NSEI')).rejects.toBeInstanceOf(MarketDataError);
    await expect(
      createFinnhubStream(fixedFeed(T0)).watch('^NSEI', () => undefined),
    ).rejects.toThrow(/does not stream/);
  });
});
