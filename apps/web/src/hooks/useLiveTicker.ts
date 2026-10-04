// Live price for one symbol from the backend's /api/live WebSocket. Display only: a simulation
// always uses the level the backend resolves when it runs.
import { useEffect, useState } from 'react';
import type { ApiErrorCode, LiveServerMessage } from '@mindspark/shared';

export type TickerStatus = 'connecting' | 'waiting' | 'live' | 'error';

export interface TickerState {
  status: TickerStatus;
  provider?: string;
  price?: number;
  /** Trade time, ISO. */
  asOf?: string;
  error?: { code: ApiErrorCode | 'CONNECTION_LOST'; message: string };
}

const RETRY_MS = 3_000;

const liveUrl = () =>
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/live`;

/** `symbol` null turns the ticker off. */
export function useLiveTicker(symbol: string | null): TickerState | null {
  // Keyed by symbol so a new symbol starts from "connecting" without a reset inside the effect.
  const [state, setState] = useState<{ symbol: string; ticker: TickerState } | null>(null);

  useEffect(() => {
    if (!symbol) return;
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    let stopped = false;
    const update = (fn: (t: TickerState) => TickerState) =>
      setState((prev) => ({
        symbol,
        ticker: fn(prev?.symbol === symbol ? prev.ticker : { status: 'connecting' }),
      }));

    const onMessage = (msg: LiveServerMessage) => {
      if (msg.type === 'subscribed') {
        update((t) => ({
          ...t,
          status: t.price === undefined ? 'waiting' : 'live',
          provider: msg.provider,
          error: undefined,
        }));
      } else if (msg.type === 'tick') {
        if (msg.symbol !== symbol) return;
        update((t) => ({
          ...t,
          status: 'live',
          price: msg.price,
          asOf: msg.asOf,
          error: undefined,
        }));
      } else {
        update((t) => ({ ...t, status: 'error', error: { code: msg.code, message: msg.message } }));
      }
    };

    const open = () => {
      const ws = new WebSocket(liveUrl());
      socket = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', symbol }));
      ws.onmessage = (event: MessageEvent<string>) => {
        try {
          onMessage(JSON.parse(event.data) as LiveServerMessage);
        } catch {
          // Not JSON: ignore.
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        update((t) => ({
          ...t,
          status: 'error',
          error: { code: 'CONNECTION_LOST', message: 'Live connection lost; reconnecting…' },
        }));
        retry = window.setTimeout(open, RETRY_MS);
      };
    };
    open();

    return () => {
      stopped = true;
      window.clearTimeout(retry);
      socket?.close();
    };
  }, [symbol]);

  if (!symbol) return null;
  return state?.symbol === symbol ? state.ticker : { status: 'connecting' };
}
