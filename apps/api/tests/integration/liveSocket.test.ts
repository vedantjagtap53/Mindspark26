// /api/live relay with a real HTTP server and WebSocket client; the market-data stream is faked.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { LiveServerMessage } from '@mindspark/shared';
import { attachLiveSocket } from '../../src/routes/liveSocket.js';
import {
  MarketDataError,
  type LevelQuote,
  type LiveStream,
} from '../../src/services/market-data/types.js';
import { silentLogger } from '../../src/utils/logger.js';

let server: Server | undefined;
let live: { close(): void } | undefined;

afterEach(async () => {
  live?.close();
  if (server) await new Promise((r) => server!.close(r));
  server = undefined;
});

function fakeStream() {
  const emitters = new Map<string, (q: LevelQuote) => void>();
  const stopped: string[] = [];
  const stream: LiveStream = {
    provider: 'Fake',
    watch(symbol, onQuote) {
      if (symbol === 'BAD') return Promise.reject(new MarketDataError('not covered'));
      emitters.set(symbol, onQuote);
      return Promise.resolve(() => {
        stopped.push(symbol);
        emitters.delete(symbol);
      });
    },
  };
  return { stream, emitters, stopped };
}

async function start(stream: LiveStream | undefined) {
  server = createServer();
  live = attachLiveSocket(server, stream, silentLogger);
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  return (server.address() as AddressInfo).port;
}

async function connect(port: number, path = '/api/live') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  const messages: LiveServerMessage[] = [];
  ws.on('message', (d: Buffer) => messages.push(JSON.parse(d.toString()) as LiveServerMessage));
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { ws, messages };
}

const send = (ws: WebSocket, msg: unknown) => ws.send(JSON.stringify(msg));
const codeOf = (m: LiveServerMessage | undefined) => (m?.type === 'error' ? m.code : undefined);

describe('/api/live', () => {
  it('subscribes and relays ticks for the symbol', async () => {
    const fake = fakeStream();
    const { ws, messages } = await connect(await start(fake.stream));
    send(ws, { type: 'subscribe', symbol: 'AAPL' });

    await expect
      .poll(() => messages[0])
      .toEqual({ type: 'subscribed', symbol: 'AAPL', provider: 'Fake' });
    fake.emitters.get('AAPL')!({ value: 231.5, source: 'live', asOf: '2026-10-05T14:30:00.000Z' });
    await expect
      .poll(() => messages[1])
      .toEqual({
        type: 'tick',
        symbol: 'AAPL',
        price: 231.5,
        asOf: '2026-10-05T14:30:00.000Z',
      });
    ws.close();
  });

  it('switches symbols and stops the old stream; stops on disconnect', async () => {
    const fake = fakeStream();
    const { ws, messages } = await connect(await start(fake.stream));
    send(ws, { type: 'subscribe', symbol: 'AAPL' });
    await expect.poll(() => messages.length).toBe(1);
    send(ws, { type: 'subscribe', symbol: 'MSFT' });
    await expect.poll(() => messages.length).toBe(2);
    expect(fake.stopped).toEqual(['AAPL']);

    ws.close();
    await expect.poll(() => fake.stopped).toEqual(['AAPL', 'MSFT']);
  });

  it('reports provider errors and invalid messages', async () => {
    const { ws, messages } = await connect(await start(fakeStream().stream));
    send(ws, { type: 'subscribe', symbol: 'BAD' });
    await expect
      .poll(() => messages[0])
      .toEqual({
        type: 'error',
        code: 'MARKET_DATA_UNAVAILABLE',
        message: 'not covered',
      });
    send(ws, { type: 'nonsense' });
    await expect.poll(() => codeOf(messages[1])).toBe('VALIDATION_ERROR');
    ws.close();
  });

  it('says so when no live provider is configured', async () => {
    const { ws, messages } = await connect(await start(undefined));
    send(ws, { type: 'subscribe', symbol: 'AAPL' });
    await expect.poll(() => codeOf(messages[0])).toBe('MARKET_DATA_UNAVAILABLE');
    ws.close();
  });

  it('refuses websocket upgrades on other paths', async () => {
    const port = await start(fakeStream().stream);
    await expect(connect(port, '/api/other')).rejects.toBeTruthy();
  });
});
