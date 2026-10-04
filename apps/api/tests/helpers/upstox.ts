// Test-only helpers: build Upstox protobuf frames and a fake WebSocket. Never used for production data.
import { EventEmitter } from 'node:events';
import { feedRoot } from '../../src/services/market-data/upstox/feedProto.js';
import type { FeedSocket } from '../../src/services/market-data/upstox/upstoxFeed.js';

const FeedResponse = feedRoot.lookupType(
  'com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse',
);

export interface TickInput {
  ltp: number;
  /** Epoch milliseconds. */
  ltt: number;
}

type FeedKind = 'ltpc' | 'indexFullFeed';

/** Encode a FeedResponse frame as Upstox would send it (binary protobuf). */
export function feedFrame(
  feeds: Record<string, TickInput>,
  type: 'initial_feed' | 'live_feed' | 'market_info' = 'live_feed',
  kind: FeedKind = 'ltpc',
): Buffer {
  const entries = Object.entries(feeds).map(([key, t]) => {
    const ltpc = { ltp: t.ltp, ltt: t.ltt, ltq: 1, cp: 0 };
    const feed = kind === 'ltpc' ? { ltpc } : { fullFeed: { indexFF: { ltpc } } };
    return [key, feed] as const;
  });
  const message = FeedResponse.fromObject({ type, feeds: Object.fromEntries(entries) });
  return Buffer.from(FeedResponse.encode(message).finish());
}

export class FakeSocket extends EventEmitter implements FeedSocket {
  readonly sent: Buffer[] = [];
  closed = false;
  /** Called after each send; lets a test reply like the server would. */
  onSend?: (socket: FakeSocket, frame: Buffer) => void;

  send(data: Buffer): void {
    this.sent.push(data);
    this.onSend?.(this, data);
  }

  close(): void {
    this.closed = true;
    this.emit('close');
  }

  sentJson(index = 0): unknown {
    return JSON.parse(this.sent[index]!.toString('utf8'));
  }
}

export interface FakeNetwork {
  sockets: FakeSocket[];
  urls: string[];
  authorizeCalls: Array<{ url: string; headers: Record<string, string> }>;
  fetchImpl: typeof fetch;
  socketFactory: (url: string) => FeedSocket;
}

/** A fake authorize endpoint plus a socket factory whose sockets open on the next tick. */
export function fakeNetwork(
  options: {
    authorizeStatus?: number;
    authorizeBody?: unknown;
    onSend?: FakeSocket['onSend'];
    openError?: boolean;
  } = {},
): FakeNetwork {
  const net: FakeNetwork = {
    sockets: [],
    urls: [],
    authorizeCalls: [],
    fetchImpl: ((url: string, init?: RequestInit) => {
      net.authorizeCalls.push({ url, headers: init?.headers as Record<string, string> });
      const status = options.authorizeStatus ?? 200;
      const body = options.authorizeBody ?? {
        status: 'success',
        data: { authorized_redirect_uri: 'wss://feed.example/ws?code=one-time' },
      };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }) as typeof fetch,
    socketFactory: (url) => {
      const socket = new FakeSocket();
      socket.onSend = options.onSend;
      net.sockets.push(socket);
      net.urls.push(url);
      setImmediate(() => {
        if (options.openError) socket.emit('error', new Error('connection refused'));
        else socket.emit('open');
      });
      return socket;
    },
  };
  return net;
}
