# Suitability-Aware Payoff Simulator

A suitability-aware simulator for ELN, DCD, and CPN structured products, used by relationship managers.

## Stack

- React + TypeScript frontend
- Node.js + TypeScript API
- Firebase SQL Connect (PostgreSQL) database
- External AI/ML integration for forecasts, explanations, and chat

## Getting started

Needs Node.js 20.19+ and Python 3.11+.

```sh
npm run setup          # .env files, npm install, a .venv per Python service
```

Then run each in its own terminal:

```sh
npm run dev:forecast   # forecast service, http://127.0.0.1:8000 (Mode A)
npm run dev:api        # backend API, http://127.0.0.1:4000
npm run dev:web        # frontend, http://localhost:3000 (proxies /api to the backend)
npm run dev:rag        # explain/chat service, http://127.0.0.1:8001
```

The explanation and chat need a Google Gemini key: put it in `services/rag/.env` as `GOOGLE_API_KEY`, then build the knowledge-base index once with `npm run rag:index` (again after editing `services/rag/rag/knowledge/`).

`setup` generates the key shared by the API and the forecast service. Optional: `UPSTOX_ACCESS_TOKEN` in `.env` for live Nifty 50 levels (otherwise type the level), Firebase settings for persistence.

Checks: `npm run typecheck`, `npm run lint`, `npm test`; Python tests run with each service's `.venv` (`.venv/Scripts/python -m pytest` on Windows, `.venv/bin/python -m pytest` elsewhere).

## Layout

```text
apps/web          React frontend (journey stages in src/pages, UI in src/components/<area>)
apps/api          Express API: routes → controllers → services → engines / repositories
packages/shared   Zod schemas, types and constants used by both
services/forecast Mode A forecast service (Python, owned by the AI/ML developer)
services/rag      Explanation and chat service (Python, owned by the AI/ML developer)
dataconnect       Firebase SQL Connect schema and connectors
docs              Formulas, rules, contracts; docs/design holds the archived UI prototype (zip)
scripts           setup and dev-service helpers
```

## Development rule

`PRD.md` is the source of truth. Major or architectural changes require explicit approval. See [CLAUDE.md](CLAUDE.md) and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Status

The repository scaffold is in place and `PRD.md` is v2.0. The Mode A forecast contract (`docs/forecasting.md`) and its backend client are implemented and tested. See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the build order. Database providers are consumed only behind repository adapters; no dual-write or replication is part of the current architecture.
