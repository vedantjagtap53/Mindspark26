# API_SPEC.md

Base path: `/api`

| Method    | Path                   | Responsibility                                                                                   |
| --------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| GET       | `/health`              | Operational: liveness, environment and database configuration status (no secrets).               |
| POST      | `/configure`           | Validate and normalize a product configuration.                                                  |
| POST      | `/simulate`            | Run deterministic payoff and risk calculations from Mode A forecast output or Mode B shock data. |
| POST      | `/suitability`         | Apply deterministic suitability rules.                                                           |
| POST      | `/explain`             | Send calculated context to the external AI explanation capability.                               |
| POST      | `/chat`                | Send simulation-grounded questions to the external AI chat capability.                           |
| GET, POST | `/client-profiles`     | List saved client profiles; create one.                                                          |
| GET, PUT  | `/client-profiles/:id` | Read or update one saved client profile.                                                         |
| WebSocket | `/live`                | Live prices for display, relayed from the backend's market-data feed (added 2026-10-04).         |

## `POST /suitability`, `/explain`, `/chat` (built 2026-10-04)

Every `/simulate` response carries a `simulationId`. The backend keeps the run (request, results, then profile, verdict and explanation) in API memory, approved by Karan on 2026-10-04 until Firebase persistence is wired; ids are lost on restart and expire after 12 hours (`NOT_FOUND`). The browser never sends results back.

- `/suitability` — request `{ simulationId, profile: { riskAppetite: "low"|"medium"|"high", horizonMonths, lossTolerancePct, concentrationPct } }`; response `{ simulationId, verdict, flags: [{ rule, severity: "caution"|"not_suitable", message }], lowCase: { label, returnPct, knockedIn }, productRiskRating }`. Rules: `docs/suitability-rules.md`.
- `/explain` — request `{ simulationId }` (after `/suitability`, otherwise `VALIDATION_ERROR`); response `{ simulationId, verdict, sections: { whatItIs, bestCase, worstCase, lossTriggers, suitabilityReasoning }, riskNotice, checksPassed, ungroundedNumbers, sources, model }`.
- `/chat` — request `{ simulationId, question (1–1,000 chars), history: [{ role: "user"|"assistant", content }] (≤ 40) }`; response `{ simulationId, answer, scope: "in_scope"|"out_of_scope", checksPassed, riskNote, sources, model }`.

Explain and chat call the AI service (`services/rag`, `POST {RAG_API_URL}/explain` and `/chat`, header `X-API-Key: RAG_API_KEY`) with its `SimulationContext`: product terms, the four profile fields, the computed cases (Mode A low/base/high plus distribution and model card; Mode B the scenario shocks and the RM's shock) and the verdict with flags. No client reference or name is sent. The reply is validated; an explanation naming a different verdict or simulation is rejected (`AI_INVALID_RESPONSE`, 502). Service not configured, unreachable or non-2xx → `AI_UNAVAILABLE` (503).

## WebSocket `/live`

Requested by Karan on 2026-10-04 (live ticker in the UI). The browser never connects to the provider or sees its key. Display only: `/simulate` resolves its own level when it runs. Message types: `packages/shared/src/types/live.ts`.

- Client sends `{ "type": "subscribe", "symbol": "AAPL" }` (one symbol per connection; a new subscribe replaces the old) or `{ "type": "unsubscribe" }`.
- Server sends `{ "type": "subscribed", "symbol", "provider" }`, then `{ "type": "tick", "symbol", "price", "asOf" }` for each trade (none while the market is closed), or `{ "type": "error", "code", "message" }` (`MARKET_DATA_UNAVAILABLE` when no feed is configured or the symbol is not covered, `VALIDATION_ERROR` for a bad message).
- Upgrade requests on any other path are refused.

`/client-profiles` was approved by Karan on 2026-10-03 so the RM can reuse client profiles in `/suitability`. It is supporting CRUD, not CRM: no login, ownership or roles. Profile fields: risk appetite, investment horizon, loss tolerance, concentration. Delete and the exact field schema are still to be confirmed.

## `POST /configure`

Request: `{ "productType": "ELN" | "DCD" | "CPN", "terms": {...} }`. Percent fields are percent numbers (`95` = 95%). Unknown fields are rejected. Schemas: `packages/shared/src/schemas/product.ts`.

| Product | Terms                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ELN     | `underlying {symbol, assetClass}`, `notional > 0`, `tenorDays` 30–1,095, `strikePct > 0` (of S_0), `couponPct >= 0` p.a., optional `barrierPct` + `barrierType` together |
| DCD     | `depositCurrency`, `alternateCurrency` (3-letter, different), `depositAmount > 0`, `tenorDays`, `strikeRate > 0` (alternate per 1 deposit unit), `enhancedRatePct >= 0`  |
| CPN     | `underlying`, `notional > 0`, `tenorDays`, `protectionPct` 0–100, `participationPct > 0`, optional `capPct > 0`                                                          |

ELN: omit both barrier fields for a plain ELN; the barrier must be below the strike. Response: `{ productType, terms, derived }`, where `terms` is normalized (currency codes upper-cased, symbols trimmed) and `derived` holds `tenorYears` (`tenorDays / 365`) and, for ELN, `variant` (`plain` or `barrier`). Invalid input returns `VALIDATION_ERROR` (400) with `details` listing each `path` and `message`. Nothing is persisted yet.

## `POST /simulate` — Mode B

Approved by Karan on 2026-10-04. Request: `{ "mode": "B", "productType", "terms", "shockPct", "level" }`.

- `terms`: exactly as in `/configure`.
- `shockPct`: percent number, above -100 (`-10` means -10%). It is applied to the starting level.
- `level`: where the starting level comes from.
  - `{ "source": "live" }`: ELN and CPN only. Latest price from the Upstox WebSocket feed (Nifty 50 / `^NSEI` only for now).
  - `{ "source": "reference" }`: DCD only. Latest daily FX reference rate from Frankfurter (`/v2/rate/{base}/{quote}`), indicative, not live.
  - `{ "source": "manual", "value": 25000 }`: typed by the RM; reported back as `manual` and not market data.

Response: `{ mode, productType, level: { value, source, asOf }, shock: { pct, shockedLevel }, result: { payoff, returnPct, lossAmount, knockedIn, details } }`. `asOf` is an ISO timestamp for live, a date for reference, and `null` for manual. `returnPct` is a percent number relative to the amount invested (notional or deposit amount). `lossAmount` is `max(invested - payoff, 0)`. `knockedIn` is `null` when there is no barrier. For DCD the shock moves the FX rate and `payoff` is the base-currency value.

A live price older than `MARKET_DATA_MAX_AGE_SECONDS` (default 120) and an FX rate older than `FX_RATE_MAX_AGE_DAYS` (default 4) are rejected. Nothing is substituted.

| Code                      | HTTP | When                                                                                            |
| ------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| `MARKET_DATA_UNAVAILABLE` | 503  | Live feed or FX service not configured, unreachable, rejected the token, or the value is stale. |
| `VALIDATION_ERROR`        | 400  | Bad input, including `live` for DCD, `reference` for ELN/CPN, or a symbol with no live feed.    |

## `POST /simulate` — Mode A

Request: `{ "mode": "A", "productType": "ELN" | "CPN", "terms", "trainingWindowYears"?: 5 | 10 }` (default 10). `terms` are as in `/configure`. Mode A for DCD returns `NOT_IMPLEMENTED` (501) because there is no FX forecast yet.

The backend calls the forecast service (`POST {AI_API_URL}/forecast`, contract in `docs/forecasting.md`) with the product's underlying and tenor and 500 sample paths. It validates the response, then runs the payoff engine on the low, base and high case paths and on every sample path.

Response: `{ mode, productType, spot: { value, asOf }, horizon: { tenorDays, tradingDays }, cases: { low, base, high }, distribution, fan, model, backtest, notice }`.

- Each case has `{ percentile, terminal, pathMin, payoff, returnPct, lossAmount, knockedIn, details }`. An American barrier is tested against every value on the case path.
- `distribution` is `{ pathCount, probabilityOfLoss, probabilityOfKnockIn, payoffQuantiles: { p5, p50, p95 } }`. Probabilities are fractions; `probabilityOfKnockIn` is `null` for products without a barrier.
- `fan` holds P5/P50/P95 of the underlying per trading day (index 0 = spot). Sample paths are not returned.

| Code                  | HTTP | When                                                                                                |
| --------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| `AI_UNAVAILABLE`      | 503  | Forecast service not configured, unreachable, timed out, or non-2xx (including 401 and stale data). |
| `AI_INVALID_RESPONSE` | 502  | Forecast response failed contract validation. `details` lists the issues.                           |
| `NOT_IMPLEMENTED`     | 501  | Mode A for DCD.                                                                                     |

No fallback forecast is ever substituted.

These capabilities are contractual and must not be renamed, removed, merged, or substantially redesigned without explicit approval. Exact request and response schemas remain pending the final PRD and the agreed AI interface.
