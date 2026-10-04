// WebSocket /api/live: relays live trades from the market-data stream to the browser, which never
// talks to the provider (or sees its API key). Display only; simulations resolve their own level.
// Protocol (packages/shared/src/types/live.ts): the client sends {"type":"subscribe","symbol"} or
// {"type":"unsubscribe"}; the server sends "subscribed", "tick" and "error" messages.
import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import { API_BASE_PATH, type LiveServerMessage } from '@mindspark/shared';
import type { LiveStream } from '../services/market-data/types.js';
import { AppError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';

export const LIVE_PATH = `${API_BASE_PATH}/live`;

const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('subscribe'), symbol: z.string().trim().min(1).max(40) }),
  z.strictObject({ type: z.literal('unsubscribe') }),
]);

function parseClientMessage(raw: unknown) {
  try {
    const parsed = clientMessageSchema.safeParse(JSON.parse(String(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function errorMessage(err: unknown): LiveServerMessage {
  return err instanceof AppError
    ? { type: 'error', code: err.code, message: err.message }
    : { type: 'error', code: 'INTERNAL_ERROR', message: 'Live prices are unavailable' };
}

function handleClient(ws: WebSocket, stream: LiveStream | undefined, logger: Logger): void {
  const send = (msg: LiveServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  let stop: (() => void) | null = null;
  // Bumped on every (un)subscribe so a late answer for an old symbol is dropped.
  let generation = 0;
  const unsubscribe = () => {
    generation += 1;
    stop?.();
    stop = null;
  };

  ws.on('message', (raw) => {
    const msg = parseClientMessage(raw);
    if (!msg) {
      send({
        type: 'error',
        code: 'VALIDATION_ERROR',
        message: 'Expected {"type":"subscribe","symbol":"..."} or {"type":"unsubscribe"}',
      });
      return;
    }
    unsubscribe();
    if (msg.type === 'unsubscribe') return;
    if (!stream) {
      send({
        type: 'error',
        code: 'MARKET_DATA_UNAVAILABLE',
        message:
          'Live market data is not configured (set FINNHUB_API_KEY): enter the level manually',
      });
      return;
    }

    const { symbol } = msg;
    const gen = generation;
    stream
      .watch(symbol, (quote) => {
        if (gen !== generation) return;
        send({
          type: 'tick',
          symbol,
          price: quote.value,
          asOf: quote.asOf ?? new Date().toISOString(),
        });
      })
      .then(
        (stopWatching) => {
          if (gen !== generation || ws.readyState !== ws.OPEN) {
            stopWatching();
            return;
          }
          stop = stopWatching;
          send({ type: 'subscribed', symbol, provider: stream.provider });
        },
        (err: unknown) => {
          if (gen !== generation) return;
          if (!(err instanceof AppError)) {
            logger.error('Live stream failed', { symbol, error: String(err) });
          }
          send(errorMessage(err));
        },
      );
  });
  ws.on('close', unsubscribe);
  ws.on('error', unsubscribe);
}

/** Serves /api/live on the HTTP server; other upgrade requests are refused. */
export function attachLiveSocket(server: Server, stream: LiveStream | undefined, logger: Logger) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  server.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path !== LIVE_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws: WebSocket) => handleClient(ws, stream, logger));
  return {
    close() {
      for (const client of wss.clients) client.terminate();
      wss.close();
    },
  };
}
