# ARCHITECTURE.md

`PRD.md` is authoritative; this document records the approved implementation boundary.

```text
React frontend → REST/JSON Node.js TypeScript API
                         ├─ validation and market data
                         ├─ AI API integration (external ownership)
                         └─ simulation → payoff → risk → suitability → repository interface
                                                                         └─ Supabase adapter → Supabase (PostgreSQL)
```

Mode A receives AI forecast output, then runs the same payoff, risk, and suitability pipeline as Mode B. Mode B starts with live market data plus a manual shock. AI does not determine payoff, risk, or suitability.

Mode A detail: `services/ai/forecastClient.ts` calls the external forecast service and validates the response with the shared schema in `packages/shared/src/schemas/forecast.ts`. `services/simulation/modeAScenarios.ts` turns the validated case paths and sample paths into payoff-engine inputs and distribution metrics. Contract: `docs/forecasting.md`.

The external AI boundary covers forecasting, RAG, explanation, and chat. This project validates and consumes its output only.

Caching (added 2026-10-08): answers from external services are kept in API memory (`utils/ttlCache.ts`), per process, with no shared store. A validated forecast is reused for an identical request for 15 minutes (`AI_FORECAST_CACHE_SECONDS`, at most 16 kept); the forecast service has a fixed random seed, so this changes no result, only the wait. A pair's FX reference rate is reused for 1 hour (`FX_RATE_CACHE_SECONDS`), and fan-chart price history for 1 hour. Identical requests made at the same time share one call, failures are never cached, and cached answers are frozen so no request can change the shared copy. Not cached: live prices, payoffs, risk, verdicts, explanations and anything account-related. `0` turns either setting off.

The Supabase adapter (`apps/api/src/repositories/supabase`) is the only layer allowed to depend on the Supabase SDK. Supabase is the only database (approved 2026-10-04): there is no fallback or failover, and no replication or dual-write. If the database is unavailable, persistence fails with a clear error. The API uses the server-only service-role key; row-level security is on with no policies, and the schema rejects updates and deletes of audit records.
