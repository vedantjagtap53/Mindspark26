# Market data

Source: `PRD.md` §7.2 and §7.3.

## Responsibilities of this repository's market data service

- Historical **daily closes** for each underlying and FX pair, used for the Mode A forecast chart (history segment) and as the record of what data the RM saw.
- The **live underlying level** for Mode B shocks.
- Every value carries a timestamp that is shown in the UI.

## Rules

- Instruments: Nifty 50 (`^NSEI`) first; other indices, stocks and FX pairs as configured.
- Trading holidays and missing days are skipped, never filled or interpolated.
- If the live level is unavailable or stale, Mode B returns an error; no fake or cached-as-live value is used (CLAUDE.md).
- The forecast service fetches its own training data (owned by the AI/ML developer). It reports `data.asOf`, `trainingStart` and `trainingEnd`; the backend rejects forecasts older than 5 calendar days.

## Training window (agreed for Mode A)

- Default **10 years**, optional 5 years. COVID-era data is kept; crash periods are never removed.
- Single stocks with major corporate events may use 3–5 years.

## Providers in use (2026-10-04)

- **Live level (ELN/CPN), MVP — Finnhub (decided by Karan, 2026-10-04):** real-time trades over WebSocket, backend only (`apps/api/src/services/market-data/finnhub/`). Connect to `wss://ws.finnhub.io?token=FINNHUB_API_KEY`, send `{"type":"subscribe","symbol"}`, receive `{"type":"trade","data":[{s,p,t,v}]}`. One shared connection; while symbols are watched a dropped connection is reopened with backoff and resubscribed, and trades from before the drop are discarded. Symbols are Finnhub's own: the free tier covers US stocks and crypto (`AAPL`, `BINANCE:BTCUSDT`), not Nifty 50 or other NSE symbols; index symbols (`^…`) are refused. A run uses the latest trade, or waits up to 5 s for one, and is rejected if it is older than `MARKET_DATA_MAX_AGE_SECONDS`. The same feed is relayed to the browser over `/api/live` for the live ticker. Takes precedence over Upstox when `FINNHUB_API_KEY` is set.
- **Live level, future scope — Upstox:** Upstox Market Data Feed V3 over WebSocket, backend only (`apps/api/src/services/market-data/upstox/`). Flow: `GET /v3/feed/market-data-feed/authorize` with a Bearer token returns a single-use `wss://` URL; the client connects, sends a binary JSON `sub` frame in `ltpc` mode, and decodes protobuf `FeedResponse` frames. The connection opens on the first live request and reopens on the next request after a drop; ticks from a dropped connection are discarded. Instrument key for Nifty 50: `NSE_INDEX|Nifty 50` (`^NSEI`). Set `UPSTOX_ACCESS_TOKEN` (an Upstox Analytics token is long-lived and read-only). Not yet tested against the real service.
- **Staleness:** a live price whose last-trade time is older than `MARKET_DATA_MAX_AGE_SECONDS` (default 120) is rejected, so after hours a live request fails and the RM enters the level manually.
- **FX (DCD):** Frankfurter daily reference rate, `GET /v2/rate/{base}/{quote}`, accepted up to `FX_RATE_MAX_AGE_DAYS` (default 4) old. It is end-of-day and indicative.
- **Manual:** the RM can always enter the level; it is labelled `manual` and carries no timestamp.
- **Forecast training data:** `services/forecast/forecast_service/refresh.py` appends Upstox daily candles to the forecast service's CSV (scheduled after the close; see `services/forecast/README.md`).
- **Not built yet:** daily history for the Mode A chart (backend), live FX from Upstox, other underlyings.

## Open questions

- Production data provider for history, and whether Upstox's terms cover showing its prices to other RMs (`MARKET_DATA_API_KEY` is unused).
- Whether the backend and the forecast service must use the same provider so the spot values match.
