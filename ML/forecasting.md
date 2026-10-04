# Forecast Service Contract (FastAPI)

**Version:** 1.1 (draft) · **Owner:** AI/ML · **Consumer:** Backend forecast client

The forecast service simulates possible Nifty 50 index levels over a tenor. It returns **scenarios, not a point prediction**. It does not compute payoffs, knock-in for a product, or suitability; the backend does.

## 1. Conventions
- Base path: `/v1`. JSON only. Field names are camelCase.
- All index levels are floats rounded to 2 decimals.
- `tradingDays = round(tenorDays × 252 / 365)`. Must be ≥ 1.
- Paths are indexed by **trading-day step**, not calendar date. Step 1 is the first trading day after `asOf`. Mapping steps to calendar dates (holidays) is the backend's job.
- A path has exactly `tradingDays` values. It does **not** include the starting close.

## 2. Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/forecast` | Run a forecast for one underlying and tenor |
| GET | `/v1/model-card` | Model, training window, parameters, drift, backtest |
| GET | `/v1/health` | Liveness and data freshness |

## 3. POST `/v1/forecast`

### Request
```json
{
  "underlying": "^NSEI",
  "tenorDays": 365,
  "trainingWindowYears": 10,
  "nSamplePaths": 500
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `underlying` | string | yes | Only `"^NSEI"` supported for now |
| `tenorDays` | integer | yes | 7 to 365 by default (env `MIN_TENOR_DAYS`, `MAX_TENOR_DAYS`). This is the range with enough backtest evidence. Out of range returns `422 INVALID_REQUEST` |
| `trainingWindowYears` | integer | no | Default 10. Allowed 3 to 10 |
| `nSamplePaths` | integer | no | Default 500. Allowed 0 to 1000 |

### Response `200`
```json
{
  "asOf": "2026-10-01",
  "underlying": "^NSEI",
  "lastClose": 22421.95,
  "tenorDays": 365,
  "tradingDays": 252,
  "cases": {
    "low":  { "percentile": 5,  "finalValue": 19103.0, "path": [ "...252 values" ] },
    "base": { "percentile": 50, "finalValue": 24145.0, "path": [ "...252 values" ] },
    "high": { "percentile": 95, "finalValue": 30603.0, "path": [ "...252 values" ] }
  },
  "fan": { "p5": [ "...252" ], "p50": [ "...252" ], "p95": [ "...252" ] },
  "samplePaths": [ [ "...252 values" ] ],
  "model": {
    "name": "GARCH(1,1)-t",
    "nPaths": 10000,
    "trainingWindow": { "start": "2016-10-03", "end": "2026-10-01" },
    "drift": { "type": "fixed", "perTradingDayPct": 0.03, "approxAnnualPct": 7.6 },
    "params": { "mu": 0.07106, "omega": 0.02807, "alpha": 0.09177, "beta": 0.87396, "nu": 6.78184 }
  },
  "notice": "Scenario simulation, not a guarantee."
}
```

**Case selection:** `low`, `base`, `high` are the simulated paths whose final value is closest to the 5th, 50th and 95th percentile of all final values. `finalValue` is the last value of that path.

**Payload note:** at 756 trading days and 500 sample paths the response is several MB. Use `nSamplePaths: 0` if sample paths are not needed.

## 4. Backend validation (reject and return Mode A error if any fails)
1. HTTP status is 200 and the body parses against the schema.
2. `cases.*.path`, `fan.*` each have length `tradingDays`; every `samplePaths` row too.
3. All values are finite numbers and > 0 (no NaN, Infinity or null).
4. `cases.low.finalValue ≤ cases.base.finalValue ≤ cases.high.finalValue`.
5. `fan.p5[i] ≤ fan.p50[i] ≤ fan.p95[i]` for every step.
6. `tradingDays == round(tenorDays × 252 / 365)`.
7. `asOf` is not older than the backend's staleness limit.

No fallback forecast is ever invented. On failure the backend tells the RM to retry or switch to Mode B.

## 5. GET `/v1/model-card`
Returns the model, training window, drift, parameters, supported tenor range and backtest. The backtest is computed **offline** (`backtest_results.json`) and refreshed when the data or model changes, not per request.

```json
{
  "model": "GARCH(1,1)-t",
  "nPaths": 10000,
  "trainingWindow": {
    "start": "2016-10-03",
    "end": "2026-10-01"
  },
  "drift": {
    "type": "fixed",
    "perTradingDayPct": 0.03,
    "approxAnnualPct": 7.6
  },
  "params": {
    "mu": "...",
    "omega": "...",
    "alpha": "...",
    "beta": "...",
    "nu": "..."
  },
  "supportedTenorDays": {
    "min": 7,
    "max": 365
  },
  "backtest": {
    "method": "walk-forward, expanding window (min 750 days), origins every 21 trading days, refit at each origin, 3000 paths, fixed drift 0.03%/trading day",
    "results": [
      {
        "horizonDays": 7,
        "tradingDays": 5,
        "samples": 83,
        "independentWindowsApprox": 345.4,
        "bandCoverage": 0.855,
        "belowBandRate": 0.072,
        "aboveBandRate": 0.072,
        "baseMapePct": 1.86,
        "naiveMapePct": 1.87
      },
      {
        "horizonDays": 30,
        "tradingDays": 21,
        "samples": 82,
        "independentWindowsApprox": 82.0,
        "bandCoverage": 0.927,
        "belowBandRate": 0.049,
        "aboveBandRate": 0.024,
        "baseMapePct": 3.6,
        "naiveMapePct": 3.67
      },
      {
        "horizonDays": 90,
        "tradingDays": 62,
        "samples": 80,
        "independentWindowsApprox": 27.8,
        "bandCoverage": 0.875,
        "belowBandRate": 0.062,
        "aboveBandRate": 0.062,
        "baseMapePct": 6.88,
        "naiveMapePct": 7.08
      },
      {
        "horizonDays": 365,
        "tradingDays": 252,
        "samples": 71,
        "independentWindowsApprox": 6.8,
        "bandCoverage": 0.873,
        "belowBandRate": 0.0,
        "aboveBandRate": 0.127,
        "baseMapePct": 10.15,
        "naiveMapePct": 12.92
      },
      {
        "horizonDays": 730,
        "tradingDays": 504,
        "samples": 59,
        "independentWindowsApprox": 3.4,
        "bandCoverage": 0.932,
        "belowBandRate": 0.0,
        "aboveBandRate": 0.068,
        "baseMapePct": 14.03,
        "naiveMapePct": 22.87
      },
      {
        "horizonDays": 1095,
        "tradingDays": 756,
        "samples": 47,
        "independentWindowsApprox": 2.3,
        "bandCoverage": 0.936,
        "belowBandRate": 0.0,
        "aboveBandRate": 0.064,
        "baseMapePct": 15.64,
        "naiveMapePct": 32.41
      },
      {
        "...": "13 tenors in total"
      }
    ],
    "caveat": "Origins overlap, so independentWindowsApprox (origin span / horizon + 1) is a rough count. Horizons beyond 365 days rest on 2-5 independent windows in a rising market. Drift was chosen after seeing earlier backtest results. Horizons under 7 days not tested."
  }
}
```
`bandCoverage` is the share of actual outcomes inside the P5–P95 band (target about 0.90). `belowBandRate` / `aboveBandRate` split the misses. `baseMapePct` vs `naiveMapePct` compares the base case with a no-change forecast. `independentWindowsApprox` is a rough count of non-overlapping test windows.

## 6. GET `/v1/health`
```json
{ "status": "ok", "dataAsOf": "2026-10-01", "modelFitAt": "2026-10-04T08:00:00Z" }
```

## 7. Errors
All non-200 responses use this shape:
```json
{ "error": { "code": "INVALID_REQUEST", "message": "tenorDays must be a positive integer" } }
```

| HTTP | `code` | When |
|---|---|---|
| 422 | `INVALID_REQUEST` | Schema or range violation |
| 400 | `UNSUPPORTED_UNDERLYING` | Underlying not supported |
| 503 | `DATA_STALE` | Latest close older than the allowed limit |
| 500 | `MODEL_FIT_FAILED` | Optimizer failed or parameters invalid |
| 500 | `INTERNAL` | Anything else |

## 8. Non-functional
- Target latency: under 10 seconds for any tenor (PRD §9). Fit the model once per data refresh and cache the parameters; only simulation runs per request.
- Stateless between requests. Results are reproducible: same data and request give the same output (fixed seed, env `SEED`, default 42).
- Output must always be labelled a scenario, never a single predicted value.

## 9. Open items
- Final drift assumption (currently fixed 0.03% per trading day).
- Tenors above 365 days are rejected: backtests there rest on 2 to 5 independent windows. Tenors under 7 days are untested.
- Staleness limit for `DATA_STALE` is 7 calendar days (env `STALE_DAYS`); confirm with backend.
- The PRD still states 30 to 1,095 days; it needs updating to 7 to 365 (or the limits changed via env).
- Drift has been chosen as 0.03%/trading day and the backtest hints it may be slightly low; frozen unless changed.
