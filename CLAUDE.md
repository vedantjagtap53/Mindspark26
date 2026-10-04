# Suitability-Aware Payoff Simulator

## Source of truth

`PRD.md` is the sole authoritative requirements document. Files under `prd/` are reference/archive material only. If a file under `prd/` conflicts with `PRD.md`, always follow `PRD.md`.

Do not invent, remove, or change requirements. Ask for clarification when a decision affects architecture, scope, API contracts, database design, financial formulas, suitability rules, or another developer's AI work.

## Ownership

This repository owns the React frontend, Node.js/TypeScript backend, validation, market data, deterministic payoff/risk/suitability engines, persistence, and AI API integration. A separate developer owns AI/ML, Mode A forecasting, RAG, LLM explanations, and chat intelligence. Do not implement or redesign their internals. The Mode A forecast contract between the two sides is `docs/forecasting.md`; change it only with both owners' agreement, and keep `packages/shared/src/schemas/forecast.ts` in sync with it.

## API boundary

Keep these API capabilities available: `configure`, `simulate`, `suitability`, `explain`, and `chat`. Do not rename, remove, merge, or redesign them without explicit approval. The backend consumes validated AI output and remains authoritative for numerical calculations and suitability.

## Architecture and scope

Approved stack: React + TypeScript and Node.js + TypeScript. Supabase (PostgreSQL) is the only database; there is no fallback database (approved 2026-10-04). Do not introduce Kafka, Redis, microservices, Kubernetes, GraphQL, event sourcing, CQRS, an API gateway, or another database without approval.

Products are ELN, DCD, and CPN for an RM user. Do not add login, admin roles, CRM, trading, pricing, tax, fees, early-redemption pricing, or additional products.

## Engineering rules

- Put product-specific payoff logic in separate implementations under `apps/api/src/engines/payoff/`.
- Mode A and Mode B use the same deterministic payoff engine.
- Frontend calculations are never authoritative.
- Use migrations for database schema changes.
- Never silently substitute fake production market data; mocks are limited to tests.
- Before completion: typecheck, lint, run relevant tests, review the diff, and update `IMPLEMENTATION_STATUS.md`.

## Database architecture

Business logic must not call the Supabase SDK directly.

```text
Controller → Service → Repository interface → Supabase adapter
```

Keep the Supabase implementation isolated in its adapter (`apps/api/src/repositories/supabase`). The service-role key is server-only and never reaches the frontend. There is no failover: if Supabase is unavailable, persistence fails with a clear error instead of writing anywhere else. The schema is the SQL migrations in `supabase/migrations/`; see `DATABASE_SCHEMA.md`.

Do not dual-write, replicate, or synchronize to any other store. Replacing the provider, adding a provider or a fallback, changing the repository abstraction or schema architecture, or introducing dual-write, replication, or Kafka requires explicit approval.
