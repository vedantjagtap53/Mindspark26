import { describe, expect, it } from 'vitest';
import { createUpstoxFeed } from '../../../src/services/market-data/upstox/upstoxFeed.js';
import { MarketDataError } from '../../../src/services/market-data/types.js';
import { decodeFeedResponse } from '../../../src/services/market-data/upstox/feedProto.js';
import { fakeNetwork, feedFrame, type FakeSocket } from '../../helpers/upstox.js';

const NIFTY = 'NSE_INDEX|Nifty 50';
const T0 = Date.parse('2026-10-05T04:15:00Z');

function feedWith(net: ReturnType<typeof fakeNetwork>, extra: { tickTimeoutMs?: number } = {}) {
  return createUpstoxFeed({
    accessToken: 'SECRET-TOKEN',
    apiUrl: 'https://api.example/v3/',
    fetchImpl: net.fetchImpl,
    socketFactory: net.socketFactory,
    connectTimeoutMs: 500,
    tickTimeoutMs: 50,
    ...extra,
  });
}

/** Reply to the subscribe frame with a snapshot tick, like the real feed does. */
const replyWith =
  (ltp: number, ltt = T0) =>
  (socket: FakeSocket) =>
    setImmediate(() =>
      socket.emit('message', feedFrame({ [NIFTY]: { ltp, ltt } }, 'initial_feed')),
    );

describe('protobuf decoding', () => {
  it('decodes ltpc, including a 64-bit millisecond timestamp', () => {
    const decoded = decodeFeedResponse(feedFrame({ [NIFTY]: { ltp: 25_123.45, ltt: T0 } }));
    expect(decoded.type).toBe('live_feed');
    expect(decoded.feeds?.[NIFTY]?.ltpc).toMatchObject({ ltp: 25_123.45, ltt: T0 });
  });

  it('decodes the index full-feed shape', () => {
    const decoded = decodeFeedResponse(
      feedFrame({ [NIFTY]: { ltp: 1, ltt: T0 } }, 'live_feed', 'indexFullFeed'),
    );
    expect(decoded.feeds?.[NIFTY]?.fullFeed?.indexFF?.ltpc?.ltp).toBe(1);
  });

  it('decodes a market_info frame without feeds', () => {
    expect(decodeFeedResponse(feedFrame({}, 'market_info')).feeds).toBeUndefined();
  });
});

describe('Upstox feed client', () => {
  it('authorizes with the bearer token, connects, subscribes with a binary frame, returns the first tick', async () => {
    const net = fakeNetwork({ onSend: replyWith(25_000.5) });
    const feed = feedWith(net);

    const tick = await feed.getTick(NIFTY);

    expect(tick).toEqual({ ltp: 25_000.5, ltt: T0 });
    expect(net.authorizeCalls[0]?.url).toBe(
      'https://api.example/v3/feed/market-data-feed/authorize',
    );
    expect(net.authorizeCalls[0]?.headers).toMatchObject({ Authorization: 'Bearer SECRET-TOKEN' });
    expect(net.urls).toEqual(['wss://feed.example/ws?code=one-time']);
    expect(net.sockets[0]?.sentJson()).toMatchObject({
      method: 'sub',
      data: { mode: 'ltpc', instrumentKeys: [NIFTY] },
    });
    expect(typeof (net.sockets[0]?.sentJson() as { guid: string }).guid).toBe('string');
  });

  it('reuses the connection and subscription, and serves the latest live tick', async () => {
    const net = fakeNetwork({ onSend: replyWith(25_000) });
    const feed = feedWith(net);
    await feed.getTick(NIFTY);

    net.sockets[0]!.emit('message', feedFrame({ [NIFTY]: { ltp: 25_010, ltt: T0 + 1000 } }));
    const tick = await feed.getTick(NIFTY);

    expect(tick).toEqual({ ltp: 25_010, ltt: T0 + 1000 });
    expect(net.sockets).toHaveLength(1);
    expect(net.sockets[0]?.sent).toHaveLength(1);
    expect(net.authorizeCalls).toHaveLength(1);
  });

  it('opens one connection for concurrent first requests', async () => {
    const net = fakeNetwork({ onSend: replyWith(25_000) });
    const feed = feedWith(net);
    const [a, b] = await Promise.all([feed.getTick(NIFTY), feed.getTick(NIFTY)]);
    expect(a).toEqual(b);
    expect(net.sockets).toHaveLength(1);
  });

  it('ignores undecodable and market_info frames and still returns a later good tick', async () => {
    const net = fakeNetwork({
      onSend: (socket) => {
        setImmediate(() => {
          socket.emit('message', Buffer.from([0xff, 0xff, 0xff, 0xff]));
          socket.emit('message', feedFrame({}, 'market_info'));
          socket.emit('message', feedFrame({ [NIFTY]: { ltp: 24_900, ltt: T0 } }));
        });
      },
    });
    expect(await feedWith(net).getTick(NIFTY)).toEqual({ ltp: 24_900, ltt: T0 });
  });

  it('ignores ticks with a non-positive price', async () => {
    const net = fakeNetwork({
      onSend: (socket) => {
        setImmediate(() => {
          socket.emit('message', feedFrame({ [NIFTY]: { ltp: 0, ltt: T0 } }));
          socket.emit('message', feedFrame({ [NIFTY]: { ltp: 24_900, ltt: T0 } }));
        });
      },
    });
    expect((await feedWith(net).getTick(NIFTY)).ltp).toBe(24_900);
  });

  it('fails when no price arrives for the instrument', async () => {
    const feed = feedWith(fakeNetwork(), { tickTimeoutMs: 20 });
    await expect(feed.getTick(NIFTY)).rejects.toThrow(/No price received/);
  });

  it('fails clearly when Upstox rejects the token, without leaking it', async () => {
    const feed = feedWith(
      fakeNetwork({ authorizeStatus: 401, authorizeBody: { status: 'error' } }),
    );
    const err = await feed.getTick(NIFTY).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MarketDataError);
    expect((err as Error).message).toMatch(/401/);
    expect((err as Error).message).not.toContain('SECRET-TOKEN');
  });

  it('fails on an unexpected authorize response', async () => {
    const feed = feedWith(fakeNetwork({ authorizeBody: { data: {} } }));
    await expect(feed.getTick(NIFTY)).rejects.toThrow(/unexpected authorization response/);
  });

  it('fails when the socket cannot connect', async () => {
    const feed = feedWith(fakeNetwork({ openError: true }));
    await expect(feed.getTick(NIFTY)).rejects.toThrow(/Could not connect/);
  });

  it('after a drop, re-authorizes, resubscribes, and does not serve the old tick', async () => {
    let level = 25_000;
    const net = fakeNetwork({ onSend: (socket) => replyWith(level)(socket) });
    const feed = feedWith(net);
    await feed.getTick(NIFTY);

    net.sockets[0]!.emit('close');
    level = 25_555;
    const tick = await feed.getTick(NIFTY);

    expect(tick.ltp).toBe(25_555);
    expect(net.sockets).toHaveLength(2);
    expect(net.authorizeCalls).toHaveLength(2);
    expect(net.sockets[1]?.sent).toHaveLength(1);
  });

  it('close() shuts the socket', async () => {
    const net = fakeNetwork({ onSend: replyWith(25_000) });
    const feed = feedWith(net);
    await feed.getTick(NIFTY);
    feed.close();
    expect(net.sockets[0]?.closed).toBe(true);
  });
});
