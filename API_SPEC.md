# API_SPEC.md

Base path: `/api`

| Method         | Path                                                             | Responsibility                                                                                   |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| GET            | `/health`                                                        | Operational: liveness, environment and database configuration status (no secrets).               |
| POST           | `/configure`                                                     | Validate and normalize a product configuration.                                                  |
| POST           | `/simulate`                                                      | Run deterministic payoff and risk calculations from Mode A forecast output or Mode B shock data. |
| POST           | `/suitability`                                                   | Apply deterministic suitability rules.                                                           |
| POST           | `/explain`                                                       | Send calculated context to the external AI explanation capability.                               |
| POST           | `/chat`                                                          | Send simulation-grounded questions to the external AI chat capability.                           |
| WebSocket      | `/live`                                                          | Live prices for display, relayed from the backend's market-data feed (added 2026-10-04).         |
| POST           | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | Accounts and sessions (added 2026-10-07).                                                        |
| GET, PUT       | `/auth/me`, `/auth/settings`                                     | Current session; saved settings (added 2026-10-07).                                              |
| GET, POST, PUT | `/admin/users`, `/admin/users/:id`                               | User management, Admin only (added 2026-10-07).                                                  |
| GET            | `/audit/simulations`                                             | Read-only list of every account's saved runs, Admin only (added 2026-10-07).                     |
| GET            | `/runs`                                                          | The signed-in account's own saved runs (added 2026-10-08).                                       |
| GET            | `/admin/analytics`, `/admin/activity`                            | Overview numbers and the activity log, Admin only (added 2026-10-08).                            |

## Saved runs, activity and analytics (added 2026-10-08)

Requested by Karan. Types: `packages/shared/src/types/audit.ts` and `packages/shared/src/schemas/activity.ts`.

- **Runs belong to accounts.** `simulations.user_id` links every saved run to the account that ran it (null in development without sign-in, and for rows saved before this change). `/simulate` remembers the signed-in account; `/suitability`, `/explain` and `/chat` then answer `NOT_FOUND` for a run id that belongs to another account (the same answer as for an unknown id, and the run is untouched).
- `GET /api/runs?limit=` (permission `runs:read`; 401 without a session; default 50, max 200): `{ runs: AuditSimulation[] }`, newest first, only the caller's own.
- `GET /api/audit/simulations?limit=` (Admin): `{ simulations: AuditSimulation[] }`, everyone's, each with `user` (`{ id, email, displayName }` or null).
- `AuditSimulation` (both lists): `{ id, createdAt, user, mode, productType, underlyingSymbol, currencyPair, tenorDays, notional, terms, inputs: { levelValue, levelSource, shockPct, shockedLevel, trainingWindowYears }, client, results, verdict, flags, explanationCount }`.
- **One saved run, in full** (added 2026-10-08): `GET /api/runs/:id` (permission `runs:read`; only the caller's own run) and `GET /api/audit/simulations/:id` (Admin; any run). Both return `{ run: SavedRunDetail }` = `AuditSimulation` plus `{ levelAsOf, cases: [{ scenario, percentile, terminal, pathMin, payoff, returnPct, lossAmount, knockedIn }], distribution: { pathCount, probabilityOfLoss, probabilityOfKnockIn, payoffQuantiles } | null (Mode A only), forecast (the stored Mode A forecast metadata, or null), rulesVersion, assessedAt, explanations: [{ createdAt, text, model, sources }] (oldest first) }`. Another account's run, an unknown id and a malformed id all answer `404 NOT_FOUND` ("Saved run not found"), so an id reveals nothing. Read-only: nothing is recalculated.
- `GET /api/admin/analytics` (Admin): `AdminAnalytics` = `{ generatedAt, windowDays: 30, totals: { users, activeUsers, admins, runsAllTime, runsInWindow, runsLast7Days, loginsLast7Days, failedLoginsLast7Days }, daily: [{ date, runs, logins }] (30 UTC days, zero-filled), byProduct, byMode, verdicts, topUsers, truncated }`. It reads at most 5,000 runs of the window; `truncated` says so if there were more.
- `GET /api/admin/activity?limit=` (Admin; default 100, max 500): `{ events: ActivityEvent[] }`, newest first. Events: `REGISTER`, `LOGIN`, `LOGIN_FAILED` (with the email typed and a reason: `unknown_email`, `wrong_password`, `inactive`), `LOGOUT`, `USER_CREATED`, `ROLE_CHANGED`, `USER_ACTIVATED`, `USER_DEACTIVATED`, `RUN_SAVED`. Recording is best effort: a failure is logged and never breaks the action. Passwords, tokens and request bodies are never stored.
- Tables: `activity_events` and `simulations.user_id` (`supabase/migrations/20261008100000_accounts_runs_activity.sql`).

## Accounts, roles and request integrity (added 2026-10-07)

Approved by Karan; decision record `docs/decisions/2026-10-07-auth-rbac.md`. Types and schemas: `packages/shared/src/schemas/auth.ts`.

**Roles and permissions.** `RM` (shown as "User"): `simulate:run`, `suitability:run`, `explain:run`, `chat:use`, `runs:read`. `ADMIN`: all of the RM's, plus `audit:read` and `users:manage`. (`COMPLIANCE` was removed on 2026-10-08.) `/configure` and `/simulate` need `simulate:run`, `/suitability` needs `suitability:run`, `/explain` needs `explain:run`, `/chat` needs `chat:use`. Without the permission: `FORBIDDEN` (403); with no valid session: `UNAUTHENTICATED` (401). `/health` stays public.

**Sessions.** Sign-in sets two httpOnly, SameSite=Strict cookies (`Secure` in production): `ms_access` (access token, 15 min, path `/api`) and `ms_refresh` (refresh token, 7 days, path `/api/auth`, rotated on every use), plus a script-readable `ms_theme` cookie. The browser sends them automatically; no token is ever in a response body.

When `AUTH_ENFORCED` is false (development default), anonymous callers may use the simulator routes; `/admin` and `/audit` always need a sign-in.

| Endpoint                        | Request                                                                                                            | Response                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/register`           | `{ email, password, displayName }` (the role is never accepted: unknown fields are rejected; the account is an RM) | 201 `{ user }`, session cookies set                                                                                                                                                    |
| `POST /auth/login`              | `{ email, password }`                                                                                              | 200 `{ user }`, session cookies set                                                                                                                                                    |
| `POST /auth/refresh`            | none (uses `ms_refresh`)                                                                                           | 200 `{ user }`, new cookies; 401 clears them                                                                                                                                           |
| `POST /auth/logout`             | none                                                                                                               | 204, session revoked, cookies cleared                                                                                                                                                  |
| `GET /auth/me`                  | none                                                                                                               | `{ authRequired, user }` where `user` may be `null` (always 200)                                                                                                                       |
| `PUT /auth/settings`            | `{ theme?: "light", "dark" or "system", customCursor?: boolean }` (at least one)                                   | 200 `{ user }`, `ms_theme` updated                                                                                                                                                     |
| `GET /admin/users`              | none                                                                                                               | `{ users: [{ id, email, displayName, role, settings, active, createdAt, lastLoginAt }] }`                                                                                              |
| `POST /admin/users`             | `{ email, password, displayName, role }`                                                                           | 201 `{ user }`                                                                                                                                                                         |
| `PUT /admin/users/:id`          | `{ role?, active? }`                                                                                               | 200 `{ user }`. An admin cannot change or deactivate themselves; the last active admin cannot be removed (`CONFLICT`). Role changes and deactivation revoke the user's refresh tokens. |
| `GET /audit/simulations?limit=` | `limit` 1–200 (default 50)                                                                                         | `{ simulations: [{ id, createdAt, mode, productType, underlyingSymbol, tenorDays, notional, client, results, verdict, flags, explanationCount }] }`, newest first                      |

`user` is `{ id, email, displayName, role, settings: { theme, customCursor } }`. Passwords are 10–128 characters with a lowercase letter, an uppercase letter and a digit. Wrong password, unknown email and deactivated account all answer `UNAUTHENTICATED` "Incorrect email or password". After 5 failed attempts for one address and email, sign-in answers `TOO_MANY_REQUESTS` (429) for 15 minutes. A duplicate email answers `CONFLICT`. `displayName` is 2–60 characters: letters (Latin or other non-look-alike scripts), spaces, and `. ' ’ -` only, with no digits, markup or stacked punctuation. Public sign-up also rejects reserved words that pose as an official account (admin, administrator, root, superuser, sysadmin, system, compliance, support, moderator, owner, staff, finstrukt, mindspark, null, undefined), including look-alike and full-width spellings; an administrator creating a user may use them but keeps the character rules. A name is only a label: the role is set by the server and every database call is parameterised. Without a database these routes answer `DATABASE_NOT_CONFIGURED` (503).

**Payload hash.** Requests with a body carry `X-Payload-Hash`: the lower-case hex SHA-256 of the exact body bytes. The web client adds it to every such request. A header that does not match, or is not 64 hex characters, answers `PAYLOAD_HASH_MISMATCH` (400); a missing header is refused only when `PAYLOAD_HASH_REQUIRED` is true (default in production). Requests without a body are not checked. It is an integrity check, not authentication.

**WebSocket `/live`** refuses the upgrade with 401 when sign-in is enforced and the access cookie is missing, invalid or from a role without `simulate:run`.

| Code                    | HTTP | When                                                                   |
| ----------------------- | ---- | ---------------------------------------------------------------------- |
| `UNAUTHENTICATED`       | 401  | No valid session, wrong credentials, or an expired refresh token.      |
| `FORBIDDEN`             | 403  | The role lacks the permission, or an admin tried to change themselves. |
| `TOO_MANY_REQUESTS`     | 429  | Too many failed sign-ins.                                              |
| `PAYLOAD_HASH_MISMATCH` | 400  | `X-Payload-Hash` is wrong, malformed, or required and missing.         |

## `POST /suitability`, `/explain`, `/chat` (built 2026-10-04)

Every `/simulate` response carries a `simulationId`. The backend keeps the run (request, results, then profile, verdict and explanation) in API memory as working state for suitability, explain and chat; ids are lost on restart and expire after 12 hours (`NOT_FOUND`). The browser never sends results back.

**Persistence (2026-10-04).** When Supabase is configured, `/suitability` writes the audit record before answering: the product configuration (once per run), the simulation with its risk results and a frozen snapshot of the client as entered (name, age and the four rule fields), and the verdict with its flags and `rulesVersion`. `/explain` then stores the explanation against that record. Sample paths and the fan are never stored. A database failure fails the request (`DATABASE_ERROR`, 500); nothing is written anywhere else. Without a configured database (development, tests) nothing is persisted and the response says `persisted: false`. A second `/suitability` call for the same run writes a new simulation record for the new client.

- `/suitability` — request `{ simulationId, profile: { name? (1–120 chars), age? (whole number, 18–120), riskAppetite: "low"|"medium"|"high", horizonMonths, lossTolerancePct, concentrationPct } }` (unknown fields are rejected; since 2026-10-08 the web app no longer asks for a client name or age and sends neither, so both are optional; if sent they are display-only: no rule reads them, they are stored with the audit record, and they are never sent to the AI service); response `{ simulationId, verdict, flags: [{ rule, severity: "caution"|"not_suitable", message }], lowCase: { label, returnPct, knockedIn }, productRiskRating, persisted }`. Rules: `docs/suitability-rules.md`.
- `/explain` — request `{ simulationId }` (after `/suitability`, otherwise `VALIDATION_ERROR`); response `{ simulationId, verdict, sections: { whatItIs, bestCase, worstCase, lossTriggers, suitabilityReasoning }, riskNotice, checksPassed, ungroundedNumbers, sources, model }`.
- `/chat` — request `{ simulationId, question (1–1,000 chars), history: [{ role: "user"|"assistant", content }] (≤ 40) }`; response `{ simulationId, answer, scope: "in_scope"|"out_of_scope", checksPassed, riskNote, sources, model }`.

Explain and chat call the AI service (`services/rag`, `POST {RAG_API_URL}/explain` and `/chat`, header `X-API-Key: RAG_API_KEY`) with its `SimulationContext`: product terms, the four profile fields, the computed cases (Mode A low/base/high plus distribution and model card; Mode B the scenario shocks and the RM's shock) and the verdict with flags. The client's name and age are never sent. The reply is validated; an explanation naming a different verdict or simulation is rejected (`AI_INVALID_RESPONSE`, 502). Service not configured, unreachable or non-2xx → `AI_UNAVAILABLE` (503).

## WebSocket `/live`

Requested by Karan on 2026-10-04 (live ticker in the UI). The browser never connects to the provider or sees its key. Display only: `/simulate` resolves its own level when it runs. Message types: `packages/shared/src/types/live.ts`.

- Client sends `{ "type": "subscribe", "symbol": "AAPL" }` (one symbol per connection; a new subscribe replaces the old) or `{ "type": "unsubscribe" }`.
- Server sends `{ "type": "subscribed", "symbol", "provider" }`, then `{ "type": "tick", "symbol", "price", "asOf" }` for each trade (none while the market is closed), or `{ "type": "error", "code", "message" }` (`MARKET_DATA_UNAVAILABLE` when no feed is configured or the symbol is not covered, `VALIDATION_ERROR` for a bad message).
- Upgrade requests on any other path are refused.

**Saved client profiles removed (2026-10-04).** `/client-profiles` (GET, POST, PUT) and the optional `profileId` on `/suitability` were removed at Karan's request: the RM enters the client (name, age, risk appetite, horizon, loss tolerance, concentration) for each run, and there is nothing to load or save. These paths now return `NOT_FOUND`, and a `/suitability` body with `profileId` is rejected as an unknown field (`VALIDATION_ERROR`). The whole-number age limits (18–120) were confirmed by Karan on 2026-10-04.

## `POST /configure`

Request: `{ "productType": "ELN" | "DCD" | "CPN", "terms": {...} }`. Percent fields are percent numbers (`95` = 95%). Unknown fields are rejected. Schemas: `packages/shared/src/schemas/product.ts`.

| Product | Terms                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ELN     | `underlying {symbol, assetClass}`, `notional > 0`, `tenorDays` 30–1,095, `strikePct > 0` (of S_0), `couponPct >= 0` p.a., optional `barrierPct` + `barrierType` together |
| DCD     | `depositCurrency`, `alternateCurrency` (3-letter, different), `depositAmount > 0`, `tenorDays`, `strikeRate > 0` (alternate per 1 deposit unit), `enhancedRatePct >= 0`  |
| CPN     | `underlying`, `notional > 0`, `tenorDays`, `protectionPct` 0–100, `participationPct > 0`, optional `capPct > 0`                                                          |

ELN: omit both barrier fields for a plain ELN; the barrier must be below the strike. Response: `{ productType, terms, derived }`, where `terms` is normalized (currency codes upper-cased, symbols trimmed) and `derived` holds `tenorYears` (`tenorDays / 365`) and, for ELN, `variant` (`plain` or `barrier`). Invalid input returns `VALIDATION_ERROR` (400) with `details` listing each `path` and `message`. Configurations are persisted with the audit record at `/suitability`, not here.

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

Each `curve` and `scenarios` row (`ShockOutcome`) is `{ shockPct, level, payoff, returnPct, lossAmount, knockedIn, settlement? }`. `settlement` (added 2026-10-08, optional, DCD only) is `{ amount, currency, converted }`: what the DCD actually pays, in the deposit currency at or below the strike or in the alternate currency, converted at the strike, above it. `payoff` is always that amount expressed in the deposit currency at the shocked rate (its USD equivalent for a USD deposit), so a converted row shows the same fixed `settlement.amount` while `payoff` falls as the rate rises. ELN and CPN rows have no `settlement`.

| Code                      | HTTP | When                                                                                            |
| ------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| `MARKET_DATA_UNAVAILABLE` | 503  | Live feed or FX service not configured, unreachable, rejected the token, or the value is stale. |
| `VALIDATION_ERROR`        | 400  | Bad input, including `live` for DCD, `reference` for ELN/CPN, or a symbol with no live feed.    |

## `POST /simulate` — Mode A

Request: `{ "mode": "A", "productType": "ELN" | "DCD" | "CPN", "terms", "trainingWindowYears"?: number }` (years, from 30/365 to 3; default 3). `terms` are as in `/configure`.

DCD (changed 2026-10-04, at Karan's request): the forecast service has no USD/INR data, so for a DCD the backend asks it for the **Nifty 50** (`^NSEI`) and returns the forecast as **context only**: `{ kind: "forecast_context", mode: "A", productType: "DCD", underlying: { symbol, name }, spot, horizon, fan, model, backtest, history, notice }`. A DCD pays on USD/INR, not on the Nifty 50, so **no DCD payoff, risk, scenarios or breakevens are calculated from it**, the response has no `simulationId`, and the run is not stored: `/suitability`, `/explain` and `/chat` return `NOT_FOUND` for it. The DCD payoff and verdict stay in Mode B. Real USD/INR forecasting needs FX data and support in the forecast service (open decision 2).

The backend calls the forecast service (`POST {AI_API_URL}/forecast`, contract in `docs/forecasting.md`) with the product's underlying and tenor and 500 sample paths. It validates the response, then runs the payoff engine on the low, base and high case paths and on every sample path.

Response: `{ mode, productType, spot: { value, asOf }, horizon: { tenorDays, tradingDays }, cases: { low, base, high }, distribution, fan, model, backtest, notice }`.

- Each case has `{ percentile, terminal, pathMin, payoff, returnPct, lossAmount, knockedIn, details }`. An American barrier is tested against every value on the case path.
- `distribution` is `{ pathCount, probabilityOfLoss, probabilityOfKnockIn, payoffQuantiles: { p5, p50, p95 } }`. Probabilities are fractions; `probabilityOfKnockIn` is `null` for products without a barrier.
- `fan` holds P5/P50/P95 of the underlying per trading day (index 0 = spot). Sample paths are not returned.
- `curve`, `scenarios`, `breakevens`: as in Mode B, computed from the forecast spot.
- `history` (added 2026-10-04): `{ status: "ok", source, points: [{ date, close }] }` with up to 252 recent daily closes ending on the forecast's as-of date, or `{ status: "unavailable", reason }` when no provider is configured (`MARKET_HISTORY_PROVIDER`), it failed, or its close on that date differs from the forecast spot by more than 0.05%. Display only.

| Code                  | HTTP | When                                                                                                |
| --------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| `AI_UNAVAILABLE`      | 503  | Forecast service not configured, unreachable, timed out, or non-2xx (including 401 and stale data). |
| `AI_INVALID_RESPONSE` | 502  | Forecast response failed contract validation. `details` lists the issues.                           |

No fallback forecast is ever substituted.

These capabilities are contractual and must not be renamed, removed, merged, or substantially redesigned without explicit approval. Exact request and response schemas remain pending the final PRD and the agreed AI interface.
