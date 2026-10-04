// Upstox Market Data Feed V3 client (backend only; the browser never connects to Upstox).
// Flow: GET /feed/market-data-feed/authorize (Bearer token) → single-use wss:// URL → connect →
// send a *binary* JSON subscribe frame → decode protobuf FeedResponse frames into a latest-tick cache.
// The connection is opened lazily on the first request and reopened by the next request after a drop.

import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { MarketDataError } from '../types.js';
import { decodeFeedResponse, ltpcOf } from './feedProto.js';

export interface FeedSocket {
  on(event: 'open' | 'close', listener: () => void): unknown;
  on(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[]) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  send(data: Buffer): void;
  close(): void;
}

export interface UpstoxTick {
  ltp: number;
  /** Last trade time, epoch milliseconds (0 when the feed did not send one). */
  ltt: number;
}

export interface UpstoxFeedConfig {
  accessToken: string;
  /** e.g. https://api.upstox.com/v3 */
  apiUrl: string;
  /** How long a request waits for the first tick of a newly subscribed instrument. */
  tickTimeoutMs?: number;
  connectTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  socketFactory?: (url: string) => FeedSocket;
  log?: (message: string) => void;
}

export interface UpstoxFeed {
  getTick(instrumentKey: string): Promise<UpstoxTick>;
  close(): void;
}

const authorizeResponseSchema = z.object({
  data: z.object({ authorized_redirect_uri: z.string().min(1) }),
});

const toBuffer = (data: Buffer | ArrayBuffer | Buffer[]): Buffer =>
  Buffer.isBuffer(data)
    ? data
    : Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.from(new Uint8Array(data));

export function createUpstoxFeed(config: UpstoxFeedConfig): UpstoxFeed {
  const fetchImpl = config.fetchImpl ?? fetch;
  const socketFactory = config.socketFactory ?? ((url: string) => new WebSocket(url));
  const tickTimeoutMs = config.tickTimeoutMs ?? 5_000;
  const connectTimeoutMs = config.connectTimeoutMs ?? 10_000;
  const log = config.log ?? (() => undefined);

  const ticks = new Map<string, UpstoxTick>();
  const waiters = new Map<string, Array<(tick: UpstoxTick) => void>>();
  const subscribed = new Set<string>();
  let socket: FeedSocket | null = null;
  let connecting: Promise<FeedSocket> | null = null;

  async function authorizedUrl(): Promise<string> {
    let res: Response;
    try {
      res = await fetchImpl(
        `${config.apiUrl.replace(/\/+$/, '')}/feed/market-data-feed/authorize`,
        {
          headers: { Authorization: `Bearer ${config.accessToken}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(connectTimeoutMs),
        },
      );
    } catch {
      throw new MarketDataError('Upstox is unreachable or timed out');
    }
    if (!res.ok) {
      throw new MarketDataError(`Upstox rejected the feed authorization (HTTP ${res.status})`);
    }
    const parsed = authorizeResponseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) {
      throw new MarketDataError('Upstox returned an unexpected authorization response');
    }
    return parsed.data.data.authorized_redirect_uri;
  }

  function onMessage(data: Buffer | ArrayBuffer | Buffer[]): void {
    let decoded;
    try {
      decoded = decodeFeedResponse(toBuffer(data));
    } catch {
      log('Ignoring an undecodable Upstox feed frame');
      return;
    }
    for (const [key, feed] of Object.entries(decoded.feeds ?? {})) {
      const ltpc = ltpcOf(feed);
      if (!ltpc?.ltp || !Number.isFinite(ltpc.ltp) || ltpc.ltp <= 0) continue;
      const tick: UpstoxTick = { ltp: ltpc.ltp, ltt: ltpc.ltt ?? 0 };
      ticks.set(key, tick);
      for (const resolve of waiters.get(key) ?? []) resolve(tick);
      waiters.delete(key);
    }
  }

  function connect(): Promise<FeedSocket> {
    if (socket) return Promise.resolve(socket);
    connecting ??= (async () => {
      const url = await authorizedUrl();
      return await new Promise<FeedSocket>((resolve, reject) => {
        const ws = socketFactory(url);
        const timer = setTimeout(() => {
          ws.close();
          reject(new MarketDataError('Timed out connecting to the Upstox feed'));
        }, connectTimeoutMs);
        ws.on('open', () => {
          clearTimeout(timer);
          socket = ws;
          resolve(ws);
        });
        ws.on('message', onMessage);
        ws.on('error', (err) => {
          clearTimeout(timer);
          log(`Upstox feed error: ${err.message}`);
          reject(new MarketDataError('Could not connect to the Upstox feed'));
        });
        ws.on('close', () => {
          clearTimeout(timer);
          if (socket === ws) socket = null;
          subscribed.clear();
          // Ticks from a dropped connection are discarded: they would otherwise look current.
          ticks.clear();
        });
      });
    })().finally(() => {
      connecting = null;
    });
    return connecting;
  }

  function waitForTick(key: string): Promise<UpstoxTick> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const list = waiters.get(key)?.filter((w) => w !== onTick);
        if (list?.length) waiters.set(key, list);
        else waiters.delete(key);
        reject(new MarketDataError(`No price received from Upstox for ${key}`));
      }, tickTimeoutMs);
      const onTick = (tick: UpstoxTick) => {
        clearTimeout(timer);
        resolve(tick);
      };
      waiters.set(key, [...(waiters.get(key) ?? []), onTick]);
    });
  }

  return {
    async getTick(instrumentKey) {
      const ws = await connect();
      if (!subscribed.has(instrumentKey)) {
        const frame = {
          guid: randomUUID(),
          method: 'sub',
          data: { mode: 'ltpc', instrumentKeys: [instrumentKey] },
        };
        // Upstox requires subscription requests as binary frames, not text.
        ws.send(Buffer.from(JSON.stringify(frame)));
        subscribed.add(instrumentKey);
      }
      return ticks.get(instrumentKey) ?? (await waitForTick(instrumentKey));
    },
    close() {
      socket?.close();
      socket = null;
      subscribed.clear();
      ticks.clear();
    },
  };
}
