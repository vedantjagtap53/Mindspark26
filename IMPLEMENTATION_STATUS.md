# IMPLEMENTATION_STATUS.md

`PRD.md` is the source of truth.

## Status legend

- [ ] Not started
- [~] In progress
- [x] Complete
- [!] Blocked
- [?] Requires user decision

## Phase 0 — Project foundation

- [x] Repository foundation and workspace layout
- [x] Governance and architecture documentation
- [x] Environment example and ignore rules
- [x] Database boundary documented (Firebase SQL Connect only since 2026-10-04)
- [x] Final `PRD.md` content — imported from `prd/prd_2_mindspark.md` (2026-10-03)
- [x] PRD formulas and suitability rules transcribed to `docs/`
- [x] `PRD.md` updated to v2.0 with the agreed Mode A method (2026-10-03)
- [x] Mode A forecast contract documented in `docs/forecasting.md`
- [x] Build order in `IMPLEMENTATION_PLAN.md`

## Product and backend work

- [x] Frontend (`apps/web`) — five-stage journey wired to the real API: product forms with shared-schema checks and `/api/configure`, Mode A/B for all three products, payoff chart with breakevens, scenario table (both modes), fan chart with price history, risk panel, model card, live ticker, suitability verdict with flags and audit status, AI explanation and chat, session runs and print memo, save / load / update client profiles (2026-10-04).
- [x] Local setup (2026-10-04): `npm run setup` (.env files with a generated shared AI key, npm install, a `.venv` per Python service), `npm run dev:forecast` / `dev:rag` start scripts, README "Getting started". `jsdom` moved to the root devDependencies so `npm test` runs the web tests. The `apps/Frontend` prototype is archived as `docs/design/payoff-desk-prototype.zip` (it was in the `apps/*` workspace and failed root lint). Mode A verified end to end against the local forecast service.
- [x] `npm run lint` clean (2026-10-04): `**/.venv/`, Playwright output and the root `Frontend/` prototype are ignored. `Frontend/` and `ML/` at the root look like pre-workspace copies of `apps/web` and `services/forecast`; delete them if no longer needed (your call).
- [!] `npm audit`: 2 moderate (`uuid` via `gaxios`, a firebase-admin dependency); no non-breaking fix available.
- [x] Backend foundation — Express 5 app, validated env/config, error middleware, `GET /api/health`, build/start scripts (2026-10-03)
- [~] Firebase schema — typed `dataconnect/schema/schema.gql` (6 tables, 6 enums), applied by the SQL Connect emulator 3.4.22 to PostgreSQL 16 (2026-10-04). Not deployed: needs a real Firebase project and Cloud SQL instance (`dataconnect/dataconnect.yaml` holds placeholders).
- [x] SQL Connect connectors (`dataconnect/connector/`, 13 server-only operations, no deletes), all verified on the emulator (2026-10-04)
- [x] Repository interfaces (`apps/api/src/repositories/interfaces/`) and contract test suite; a test-only in-memory implementation passes it (2026-10-04)
- [x] Firebase SQL Connect repository adapter (`apps/api/src/repositories/firebase/`), passes the contract suite on the emulator 24/24, wired into the services (2026-10-04)
- [x] Product configuration and validation — ELN/DCD/CPN term schemas (`packages/shared/src/schemas/product.ts`); saved-profile schema (`savedProfileInputSchema`). Upper limits beyond the PRD's are an open decision.
- [x] ELN / DCD / CPN payoff engines — `apps/api/src/engines/payoff/`, 63 unit tests including the product-notes worked examples (2026-10-03)
- [x] Live prices via Finnhub WebSocket (MVP, 2026-10-04): live level for Mode B and a `/api/live` relay feeding a live ticker in the Simulate stage; Upstox kept as future scope. Free tier covers US stocks and crypto, not Nifty 50. Not yet tried with a real key.
- [~] Market-data integration — Upstox WebSocket live level (Nifty 50), Frankfurter FX reference rate, and daily history for the fan chart from Yahoo Finance (`MARKET_HISTORY_PROVIDER=yahoo`, 2026-10-04). Live FX and other underlyings not built. No provider has been called from this sandbox (outbound market-data hosts are blocked).
- [x] Mode B simulation — `POST /api/simulate` (2026-10-04)
- [x] Mode A AI API integration — `/api/simulate` Mode A for ELN and CPN, tested end to end against the real forecast service (2026-10-04). DCD Mode A built on the backend and frontend (2026-10-04), using the proposed FX symbol `USDINR` (`assetClass: fx`); it works once the forecast service supports FX (AI/ML developer).
- [x] Forecast service — `services/forecast/` brought to contract v1.0, with a variance fix, Bearer auth and strict request validation (2026-10-04)
- [x] Risk engine — return %, loss amount, exact breakevens (scan + 40-round bisection, `engines/risk/breakeven.ts`), payoff curve and scenario table in both modes
- [x] Suitability engine — rules decided 2026-10-04, `apps/api/src/engines/suitability/` with unit tests
- [x] Persistence (2026-10-04) — `/api/suitability` writes configuration, simulation, risk results, profile snapshot and verdict; `/api/explain` writes the explanation; `/api/client-profiles` reads and writes profiles. Verified on the emulator (app-level test and browser test). Without database settings nothing is persisted and the verdict says so (`persisted: false`). Runs stay in API memory as working state.
- [x] Tests — unit and integration (API, web), Python (forecast), emulator suites, and Playwright browser tests in `tests/e2e` (`npm run test:e2e`, 2026-10-04)

## API boundary

- [x] `GET /api/health` (operational)
- [x] `POST /api/configure` (validation and normalization only; persistence later)
- [x] `POST /api/simulate` — Mode A and Mode B for ELN, DCD and CPN (DCD Mode A depends on FX support in the forecast service)
- [x] `POST /api/suitability` (2026-10-04)
- [x] `POST /api/explain` — via services/rag; tested with a stubbed AI service, not yet with a real Gemini key (2026-10-04)
- [x] `POST /api/chat` — via services/rag; same testing status (2026-10-04)

## Current task

2026-10-04 (MVP completion): persistence wired and verified on the emulator, `/api/client-profiles` and Load Saved Profile, Yahoo Finance data source for the refresh job and fan-chart history, DCD Mode A on the backend and frontend, Playwright browser tests. Open decisions and credentials: `docs/decisions/2026-10-04-open-decisions.md`.

Earlier:

Step 0 done (2026-10-03): the 8 formula and suitability decisions are recorded in `docs/product-formulas.md`, `docs/suitability-rules.md` and `API_SPEC.md`. AI/ML developer starts the forecast service in parallel.
Backend foundation done (2026-10-03). `/api/configure`, product schemas and payoff engines done. Mode B in `/api/simulate` done (2026-10-04) with Upstox WebSocket and Frankfurter. Mode A done (2026-10-04) with the forecast service. Next: try the live feed with a real Upstox token, then the suitability decisions, the database layer and the frontend.

## Decided 2026-10-03 (Karan)

- [x] Coupon `T = tenorDays / 365`; strike and barrier are % of `S_0`; touching the barrier is knock-in; the DCD base is the deposit currency; Mode B American knock-in uses the shocked value.
- [x] Verdict: hard flag → Not suitable, other flag → Caution, none → Suitable. Ratings: CPN Low, DCD High, ELN High.
- [x] Saved client profiles via `/api/client-profiles`.

## Blocked / requires decision

- [!] Forecast data refresh: `refresh.py` now defaults to Yahoo Finance (free, no key; Upstox kept as `--source upstox`), 2026-10-04. Not yet run against the live source (blocked from this sandbox) or scheduled. Until it runs, Mode A fails with `DATA_STALE` once `services/forecast/data/nifty50_clean.csv` (ends 2026-10-01) is more than 5 days old, i.e. from 2026-10-07.
- [?] Three equal-close rows in `nifty50_clean.csv` (2016-10-27, 2017-03-31, 2024-05-08): reviewed 2026-10-04, each has its own OHLC/volume, so they look genuine; confirm against NSE and approve keeping them.
- [?] `backtest_results.json` predates the variance fix. Re-run on 2026-10-04 (not written to the data folder): see `docs/decisions/2026-10-04-open-decisions.md`; approve replacing the published file (AI/ML developer's artefact).

- [x] Suitability decisions made 2026-10-04 (hard flags, scale, 25% concentration limit, units, Mode B low case) — see `docs/suitability-rules.md`.
- [?] CPN cap semantics confirmation — see `docs/product-formulas.md`.
- [x] `/client-profiles` built on the decided fields, no delete (2026-10-04). `/suitability` accepts an optional `profileId` to link the record (additive).
- [?] Product notes vs formula: the plain-ELN −10% row in the notes (₹11,00,000) contradicts the formula; the engine follows the formula — see `docs/product-formulas.md`.
- [?] Validation limits other than tenor (tenor is now 30–1,095 days, PRD §3) and endpoint payload schemas. The forecast contract is `docs/forecasting.md`; explain/chat follow the AI service's own `SimulationContext` (services/rag/rag/schemas.py), summarised in `API_SPEC.md`.
- [?] Market data provider: Yahoo Finance chosen for daily history and the forecast refresh (free, unofficial); approve its terms for this use, or name a licensed provider — see `docs/market-data.md`.

## Architecture change requests

- 2026-10-04 — Approved by Karan: Supabase removed entirely; Firebase SQL Connect is the only database, with no fallback or failover. `DATABASE_PRIMARY` and `SUPABASE_*` env variables removed; `/api/health` now reports `database: { provider: "firebase-sql-connect", configured }`, where configured means project, SQL Connect service and location are set.
- 2026-10-03 — Approved by Karan: PRD v2.0 Mode A method (GARCH(1,1) Monte Carlo, 10-year window incl. COVID, P5/P50/P95 case paths, sample paths for distribution metrics), tenor range 30–1,095 days, forecast contract v1.0, new error codes `AI_UNAVAILABLE` / `AI_INVALID_RESPONSE`. Forecast service stays external, owned by the AI/ML developer.

## Approved database architecture — 2026-10-04

Firebase SQL Connect (PostgreSQL) is the only database, behind repository interfaces and a single adapter. There is no fallback, failover, dual-write, replication or synchronization. Supersedes the 2026-10-03 Firebase-primary / Supabase-fallback design.
