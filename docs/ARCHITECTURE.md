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

The Supabase adapter (`apps/api/src/repositories/supabase`) is the only layer allowed to depend on the Supabase SDK. Supabase is the only database (approved 2026-10-04): there is no fallback or failover, and no replication or dual-write. If the database is unavailable, persistence fails with a clear error. The API uses the server-only service-role key; row-level security is on with no policies, and the schema rejects updates and deletes of audit records.
