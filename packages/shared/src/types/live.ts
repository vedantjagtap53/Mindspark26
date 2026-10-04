// WebSocket messages on /api/live: the backend relays live trades from its market-data feed to
// the browser. Display only; a simulation always uses the level the backend resolves at run time.

import type { ApiErrorCode } from './api.js';

/** Browser → backend. One symbol per connection; a new subscribe replaces the previous one. */
export type LiveClientMessage = { type: 'subscribe'; symbol: string } | { type: 'unsubscribe' };

/** Backend → browser. */
export type LiveServerMessage =
  /** Subscribed; ticks follow as trades happen (none while the market is closed). */
  | { type: 'subscribed'; symbol: string; provider: string }
  /** A trade. `asOf` is the trade time (ISO). */
  | { type: 'tick'; symbol: string; price: number; asOf: string }
  | { type: 'error'; code: ApiErrorCode; message: string };
