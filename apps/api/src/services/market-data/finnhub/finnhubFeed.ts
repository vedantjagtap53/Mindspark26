// Finnhub real-time trades over WebSocket (backend only; the API key never reaches the browser).
// Protocol: connect to wss://ws.finnhub.io?token=KEY, send {"type":"subscribe","symbol":"AAPL"},
// receive {"type":"trade","data":[{"s","p","t","v"}]} as trades happen, plus {"type":"ping"}.
// One shared connection, opened on first use. While anyone is watching a symbol, a dropped
// connection is reopened with backoff and the subscriptions are restored; trades seen before a
// drop are discarded so they can never pass for current prices.

import { WebSocket } from 'ws';
import { z } from 'zod';
import { MarketDataError } from '../types.js';

export interface FinnhubSocket {
  on(event: 'open' | 'close', listener: () => void): unknown;
  on(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[]) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  send(data: string): void;
  close(): void;
}

export interface FinnhubTrade {
  price: number;
  /** Trade time, epoch milliseconds. */
  time: number;
}

export interface FinnhubFeedConfig {
  apiKey: string;
  /** e.g. wss://ws.finnhub.io */
  wsUrl: string;
  /** How long getTrade waits for the first trade of a symbol. */
  tradeTimeoutMs?: number;
  connectTimeoutMs?: number;
  socketFactory?: (url: string) => FinnhubSocket;
  log?: (message: string) => void;
  /** Delay before reconnecting while symbols are watched; doubles up to 30 s. */
  reconnectDelayMs?: number;
}

export interface FinnhubFeed {
  /** The latest trade, or the next one within `tradeTimeoutMs`. */
  getTrade(symbol: string): Promise<FinnhubTrade>;
  /** Stream trades for a symbol until the returned function is called. */
  watch(symbol: string, onTrade: (trade: FinnhubTrade) => void): Promise<() => void>;
  close(): void;
}

const messageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('trade'),
    data: z.array(z.object({ s: z.string(), p: z.number(), t: z.number() })),
  }),
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('error'), msg: z.string().optional() }),
]);

const toText = (data: Buffer | ArrayBuffer | Buffer[]): string =>
  Buffer.isBuffer(data)
    ? data.toString('utf8')
    : Array.isArray(data)
      ? Buffer.concat(data).toString('utf8')
      : Buffer.from(new Uint8Array(data)).toString('utf8');

function parseFrame(data: Buffer | ArrayBuffer | Buffer[]) {
  try {
    const parsed = messageSchema.safeParse(JSON.parse(toText(data)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createFinnhubFeed(config: FinnhubFeedConfig): FinnhubFeed {
  const socketFactory = config.socketFactory ?? ((url: string) => new WebSocket(url));
  const tradeTimeoutMs = config.tradeTimeoutMs ?? 5_000;
  const connectTimeoutMs = config.connectTimeoutMs ?? 10_000;
  const baseDelay = config.reconnectDelayMs ?? 2_000;
  const log = config.log ?? (() => undefined);
  const url = `${config.wsUrl.replace(/\/+$/, '')}?token=${encodeURIComponent(config.apiKey)}`;

  const latest = new Map<string, FinnhubTrade>();
  const listeners = new Map<string, Set<(trade: FinnhubTrade) => void>>();
  const subscribed = new Set<string>();
  let socket: FinnhubSocket | null = null;
  let connecting: Promise<FinnhubSocket> | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let delay = baseDelay;
  let closed = false;

  function onMessage(data: Buffer | ArrayBuffer | Buffer[]): void {
    const msg = parseFrame(data);
    if (!msg) {
      log('Ignoring an unexpected Finnhub frame');
      return;
    }
    if (msg.type === 'error') {
      log(`Finnhub error: ${msg.msg ?? 'unknown'}`);
      return;
    }
    if (msg.type !== 'trade') return;
    for (const t of msg.data) {
      if (!Number.isFinite(t.p) || t.p <= 0 || !(t.t > 0)) continue;
      const prev = latest.get(t.s);
      if (prev && prev.time > t.t) continue;
      const trade = { price: t.p, time: t.t };
      latest.set(t.s, trade);
      for (const fn of listeners.get(t.s) ?? []) fn(trade);
    }
  }

  function subscribe(ws: FinnhubSocket, symbol: string): void {
    if (subscribed.has(symbol)) return;
    ws.send(JSON.stringify({ type: 'subscribe', symbol }));
    subscribed.add(symbol);
  }

  function scheduleReconnect(): void {
    if (closed || reconnectTimer || listeners.size === 0) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect().then(
        (ws) => {
          delay = baseDelay;
          for (const symbol of listeners.keys()) subscribe(ws, symbol);
        },
        () => {
          delay = Math.min(delay * 2, 30_000);
          scheduleReconnect();
        },
      );
    }, delay);
  }

  function connect(): Promise<FinnhubSocket> {
    if (socket) return Promise.resolve(socket);
    if (closed) return Promise.reject(new MarketDataError('The Finnhub feed is closed'));
    connecting ??= new Promise<FinnhubSocket>((resolve, reject) => {
      const ws = socketFactory(url);
      let opened = false;
      const timer = setTimeout(() => {
        ws.close();
        reject(new MarketDataError('Timed out connecting to the Finnhub feed'));
      }, connectTimeoutMs);
      ws.on('open', () => {
        clearTimeout(timer);
        opened = true;
        socket = ws;
        resolve(ws);
      });
      ws.on('message', onMessage);
      ws.on('error', (err) => {
        clearTimeout(timer);
        log(`Finnhub feed error: ${err.message}`);
        // A rejected handshake (bad or missing API key) also lands here.
        if (!opened) {
          reject(
            new MarketDataError('Could not connect to the Finnhub feed (check FINNHUB_API_KEY)'),
          );
        }
      });
      ws.on('close', () => {
        clearTimeout(timer);
        if (socket === ws) socket = null;
        subscribed.clear();
        latest.clear();
        if (opened) scheduleReconnect();
      });
    }).finally(() => {
      connecting = null;
    });
    return connecting;
  }

  function addListener(symbol: string, fn: (trade: FinnhubTrade) => void): () => void {
    const set = listeners.get(symbol) ?? new Set();
    listeners.set(symbol, set);
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0 && listeners.get(symbol) === set) listeners.delete(symbol);
    };
  }

  function nextTrade(symbol: string): Promise<FinnhubTrade> {
    return new Promise((resolve, reject) => {
      const remove = addListener(symbol, (trade) => {
        clearTimeout(timer);
        remove();
        resolve(trade);
      });
      const timer = setTimeout(() => {
        remove();
        reject(
          new MarketDataError(
            `No trades for ${symbol} from Finnhub in ${tradeTimeoutMs / 1000} s: the market may be ` +
              'closed or the symbol is not covered. Enter the level manually.',
          ),
        );
      }, tradeTimeoutMs);
    });
  }

  return {
    async getTrade(symbol) {
      const ws = await connect();
      subscribe(ws, symbol);
      return latest.get(symbol) ?? (await nextTrade(symbol));
    },

    async watch(symbol, onTrade) {
      const ws = await connect();
      const remove = addListener(symbol, onTrade);
      subscribe(ws, symbol);
      const last = latest.get(symbol);
      if (last) onTrade(last);
      return () => {
        remove();
        if (listeners.has(symbol) || !socket || !subscribed.has(symbol)) return;
        socket.send(JSON.stringify({ type: 'unsubscribe', symbol }));
        subscribed.delete(symbol);
        latest.delete(symbol);
      };
    },

    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      listeners.clear();
      socket?.close();
      socket = null;
      subscribed.clear();
      latest.clear();
    },
  };
}
