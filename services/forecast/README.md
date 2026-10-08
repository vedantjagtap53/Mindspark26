# Nifty 50 forecast service (Mode A)

The contract is **`docs/forecasting.md` (v1.0)** in this repository. This service implements it, and the backend validates every response against it (`packages/shared/src/schemas/forecast.ts`). Do not change the response shape here without changing all three.

## Layout

```text
services/forecast/
├── forecast_service/        Python package
│   ├── api.py               FastAPI app, auth, request validation
│   ├── service.py           ForecastService: data loading, fit cache, forecast, model card, health
│   ├── model.py             GARCH(1,1)-t fit, Monte Carlo simulation, walk-forward backtest
│   ├── contract.py          Contract v1.0 constants and response checks
│   ├── config.py            Settings from environment variables, data paths
│   └── refresh.py           Daily data refresh from Upstox
├── data/
│   ├── nifty50_clean.csv    Daily Nifty 50 closes (training data)
│   └── backtest_results.json  Offline backtest table served in the model card
├── tests/                   pytest suites (service, contract, HTTP, refresh)
├── pyproject.toml           pytest configuration
└── requirements.txt, requirements-dev.txt
```

## Run

All commands run from `services/forecast`.

```bash
pip install -r requirements.txt            # tests: pip install -r requirements-dev.txt
FORECAST_API_KEY=<same as backend AI_API_KEY> uvicorn forecast_service.api:app --host 127.0.0.1 --port 8000
pytest                                     # all tests
python -m forecast_service.model 180       # print a forecast summary for a 180-day tenor
```

Backend `.env`: `AI_API_URL=http://127.0.0.1:8000/v1` and `AI_API_KEY=<same key>`. The backend calls `POST {AI_API_URL}/forecast`.

## Endpoints

| Method | Path             | Auth   | Purpose                                                  |
| ------ | ---------------- | ------ | -------------------------------------------------------- |
| POST   | `/v1/forecast`   | Bearer | Contract v1.0 forecast                                   |
| GET    | `/v1/model-card` | Bearer | Model, parameters, supported tenors, full backtest table |
| GET    | `/v1/health`     | none   | `status` (`ok` or `stale`), `dataAsOf`, `modelFitAt`     |

Errors: `{ "error": { "code", "message" } }` with `401 UNAUTHORIZED`, `422 INVALID_REQUEST`, `400 UNSUPPORTED_UNDERLYING`, `503 DATA_STALE`, `500 MODEL_FIT_FAILED` / `INTERNAL`. The backend treats every non-2xx as `AI_UNAVAILABLE`.

## Behaviour

- Only `^NSEI` (`assetClass: "index"`). Tenor 30–1,095 days, training window 30/365 to 3 years (default 3), `samplePathCount` 100–2,000 (default 500). Unknown fields and loosely typed values (e.g. `"182"`) are rejected.
- GARCH(1,1) with Student-t errors, 10,000 paths, fixed drift 0.03% per trading day (`model.drift.method = "fixed"`, `annualized = 0.0756`). Fixed seed: the same data and request give the same output.
- `backtest` is the row of `data/backtest_results.json` closest to the requested horizon; `horizonTradingDays` says which one. `windows` is the number of (overlapping) backtest origins.
- Data is `data/nifty50_clean.csv`. It is re-read automatically when the file changes. Requests fail with `DATA_STALE` when the last close is more than 5 days old (same limit as the backend).

## Env

`FORECAST_API_KEY`, `FORECAST_ALLOW_UNAUTHENTICATED` (local only), `DATA_PATH`, `BACKTEST_PATH`, `MIN_TENOR_DAYS` (30), `MAX_TENOR_DAYS` (1095), `DRIFT_PCT_PER_DAY` (0.03), `STALE_DAYS` (5), `N_PATHS` (10000, minimum 10000), `SEED` (42).

## Data refresh

`forecast_service/refresh.py` appends new daily closes to `data/nifty50_clean.csv`. Sources:

- `yahoo` (default): Yahoo Finance chart API for `^NSEI`. Free, no account or key; unofficial (no SLA; Yahoo's terms apply). Prices are rounded to 2 decimals (Yahoo returns float32 noise) and bars without a close (holidays) are skipped. `YAHOO_API_URL` overrides the host.
- `upstox`: `GET /v3/historical-candle/NSE_INDEX|Nifty 50/days/1/{to}/{from}`; needs `UPSTOX_ACCESS_TOKEN`.

```bash
python -m forecast_service.refresh --dry-run                    # Yahoo: fetch and validate only
python -m forecast_service.refresh                              # Yahoo: append and save
UPSTOX_ACCESS_TOKEN=... python -m forecast_service.refresh --source upstox
```

`REFRESH_SOURCE` sets the default source.

- It re-fetches the last day already in the CSV and aborts if the source's close differs by more than 0.01, which catches a different or adjusted source.
- It ignores today's candle before 16:00 IST, validates every new row (positive prices, consistent OHLC, unique new dates), and never fills holidays.
- It writes atomically (temp file + rename). On any error nothing is written and the exit code is 1.
- The running service picks up the new file automatically.

Schedule it after the close on trading days, for example at 16:30 IST:

- Linux/macOS cron: `30 16 * * 1-5 cd /path/to/services/forecast && python -m forecast_service.refresh >> refresh.log 2>&1` (cron uses the server's time zone).
- Windows Task Scheduler: a daily task at 16:30 that runs `python -m forecast_service.refresh` with `services/forecast` as the start folder.
- From the repo root, `npm run dev:forecast` refreshes at start and every 6 hours while the service runs (`FORECAST_AUTO_REFRESH=off` disables it, `REFRESH_INTERVAL_HOURS` sets the interval), and `npm run refresh:forecast` runs it once. A failed run is logged and retried; it never stops the service.

If a run fails, or no job runs for more than 5 days, forecasts fail with `DATA_STALE` and `/v1/health` reports `stale`. The service never forecasts on old data.

## Known limitations

- New rows leave `Turnover_Cr` empty (the candle API has no turnover) and leave `Shares_Traded` empty when the source sends no positive volume (Yahoo reports 0 for the index). The model uses only `Close`.
- Neither source has been called from this repository's CI or sandbox (outbound access was blocked); run `--dry-run` once before scheduling. For Upstox, the docs don't say whether an Analytics token works for historical candles.
- Three rows close exactly at the previous day's close (2016-10-27, 2017-03-31, 2024-05-08). Each has its own open, high, low, volume and turnover with the close inside the day's range, so they look like genuine equal closes rather than copied rows; not yet confirmed against NSE's official data.
- The drift was chosen after earlier backtest results were seen, so the published coverage is slightly optimistic. Backtests beyond 365 days rest on 2–5 independent windows.
- Backtest numbers were produced before the 1.0.1 variance fix; re-run `forecast_service.model.backtest(df, h, drift_pct=0.03)` to refresh them.
