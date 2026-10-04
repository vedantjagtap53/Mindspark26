# Forecasting (Mode A) — method and contract

Source: `PRD.md` §7.3. The forecast service is **owned by the AI/ML developer** and runs outside this repository. This document fixes the contract between that service and the backend. The backend implementation of this contract lives in `packages/shared/src/schemas/forecast.ts` (schema) and `apps/api/src/services/ai/forecastClient.ts` (client). Change all three together, and only with both owners' agreement.

## Method (agreed, implemented by the AI/ML developer)

1. Load daily closes for the underlying over the training window, chosen by the RM: 30 days to 3 years (default 3 years; changed from "10 years, optional 5" on 2026-10-04 at the repo owner's request, not yet agreed with the forecast owner). A window this short may not include the COVID period, and a very short one leaves too few returns for a stable GARCH fit.
2. Compute daily log returns `r_t = ln(P_t / P_{t-1})`.
3. Fit GARCH(1,1) with Student-t errors (e.g. Python `arch`).
4. `tradingDays = round(tenorDays × 252 / 365)`.
5. Simulate at least 10,000 paths of `tradingDays` steps from the last close.
6. Low / base / high case = the simulated path whose final value is closest to the P5 / P50 / P95 of all final values.
7. Fan = P5 / P50 / P95 of simulated levels at each step.
8. Sample = a uniformly random subset of full paths (`samplePathCount`, default 500).
9. Backtest walk-forward at the same horizon and report band coverage and MAPE vs a no-change forecast.

## Endpoint

`POST {AI_API_URL}/forecast` with header `Authorization: Bearer {AI_API_KEY}`. Timeout on the backend: `AI_FORECAST_TIMEOUT_MS` (default 15,000 ms).

### Request

```json
{
  "underlying": { "symbol": "^NSEI", "assetClass": "index" },
  "tenorDays": 182,
  "trainingWindowYears": 3,
  "samplePathCount": 500
}
```

| Field                   | Rule                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `underlying.symbol`     | Non-empty string.                                                      |
| `underlying.assetClass` | `index`, `equity` or `fx`.                                             |
| `tenorDays`             | Integer, 30–1,095.                                                     |
| `trainingWindowYears`   | Number of years, from 30/365 (30 days) to 3 (1,095 days). Default `3`. |
| `samplePathCount`       | Integer, 100–2,000. Default `500`.                                     |

### Response

```json
{
  "contractVersion": "1.0",
  "model": {
    "name": "garch11-t-montecarlo",
    "version": "1.0.0",
    "simulations": 10000,
    "drift": { "method": "historical-mean", "annualized": 0.11 }
  },
  "data": {
    "symbol": "^NSEI",
    "asOf": "2026-10-02",
    "trainingStart": "2016-10-03",
    "trainingEnd": "2026-10-02",
    "observations": 2468,
    "spot": 25250.4
  },
  "horizon": { "tenorDays": 182, "tradingDays": 126 },
  "cases": {
    "low": { "percentile": 5, "path": [25250.4, "... tradingDays + 1 values"] },
    "base": { "percentile": 50, "path": ["..."] },
    "high": { "percentile": 95, "path": ["..."] }
  },
  "terminalQuantiles": { "p5": 21980.1, "p50": 26410.7, "p95": 31120.9 },
  "fan": { "p5": ["... tradingDays + 1"], "p50": ["..."], "p95": ["..."] },
  "samplePaths": [["... tradingDays + 1"], "... samplePathCount paths"],
  "backtest": {
    "horizonTradingDays": 126,
    "windows": 30,
    "bandCoverage": 0.88,
    "baseMape": 0.071,
    "naiveMape": 0.074
  }
}
```

### Validation rules enforced by the backend

- `contractVersion` must be `1.0`.
- Every path, fan series and sample path has exactly `tradingDays + 1` values; index 0 equals `data.spot`.
- All price values are finite and > 0.
- `horizon.tenorDays` equals the requested tenor and `horizon.tradingDays = round(tenorDays × 252 / 365)`.
- `samplePaths.length` equals the requested `samplePathCount`.
- `terminalQuantiles.p5 ≤ p50 ≤ p95`, and the final value of each case is ordered low ≤ base ≤ high.
- `data.asOf` is no more than 5 calendar days old at request time (stale models are rejected).
- `backtest.bandCoverage` is between 0 and 1; MAPEs are ≥ 0.

Any failure → the backend returns `AI_INVALID_RESPONSE`. Network failure, timeout or non-2xx → `AI_UNAVAILABLE`. The backend never substitutes a made-up forecast.

## How the backend uses the response

| Use                                                             | Source                                                                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low / base / high payoff, return, knock-in                      | `cases.*.path` (S_T = last value; American knock-in checks every value on the path, European only the last; touching the barrier counts as knock-in, see `product-formulas.md`) |
| Probability of loss, probability of knock-in, payoff P5/P50/P95 | Payoff engine run on every `samplePaths` entry                                                                                                                                  |
| Fan chart                                                       | `fan` + historical closes from the market data service                                                                                                                          |
| Model card                                                      | `model`, `data.trainingStart/End`, `backtest`                                                                                                                                   |
| Simulation record                                               | Everything except `samplePaths` and `fan`                                                                                                                                       |

Payload size: 500 paths × 757 values (3-year tenor) ≈ 3–4 MB of JSON. The backend's outbound request body limit does not apply; the response is parsed in memory once.

## Implementation (2026-10-04)

The service lives in `services/forecast/` (FastAPI, Python). It implements this contract exactly; see its `README.md` for running it.

- The service mounts the endpoint at `/v1/forecast`, so the backend uses `AI_API_URL=http://<host>:8000/v1`. It requires `Authorization: Bearer <key>`, where the key is the backend's `AI_API_KEY` and the service's `FORECAST_API_KEY`.
- Only `^NSEI` (`assetClass: "index"`) is supported. Other underlyings return `400 UNSUPPORTED_UNDERLYING`, which the backend reports as `AI_UNAVAILABLE`.
- Drift is a fixed 0.03% per trading day (`model.drift.method = "fixed"`, `annualized = 0.0756`) rather than the historical mean shown in the example above.
- `backtest` is the precomputed row closest to the requested horizon; `horizonTradingDays` names it, and `windows` is the number of overlapping backtest origins.
- The service rejects requests when its last close is more than 5 days old (`DATA_STALE`), the same limit the backend applies.
