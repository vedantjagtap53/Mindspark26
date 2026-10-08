# Suitability-Aware Payoff Simulator

A simulator that relationship managers (RMs) use to test structured products against a client's profile before recommending them. For each run it calculates the payoff, shows the risk, and returns a rule-based **Suitable / Caution / Not suitable** verdict with reasons, followed by a plain-language explanation and a Q&A chat.

**Products:** Equity-Linked Notes (ELN), Dual Currency Deposits (DCD) and Capital-Protected Notes (CPN).

> A simulation, not a guarantee. The numbers are scenario calculations, not predictions or advice.

## How a run works

```text
Pick product → enter terms → enter client → choose Mode A or B → payoff + risk → verdict → explanation → chat
```

- **Mode A (forecast):** the forecast service simulates the underlying (GARCH(1,1) Monte Carlo on a training window of 30 days to 3 years, chosen by the RM) and returns low (P5), base (P50) and high (P95) paths. The result is always a range, never a single price.
- **Mode B (shock):** the RM starts from a live, reference or typed level and applies a shock such as −10%.
- **Both modes use the same deterministic payoff engine** (`apps/api/src/engines/payoff`). The backend does every calculation and the suitability rules; the browser and the AI never decide a number.
- **The client** is entered for each run: name, age, risk appetite, investment horizon, loss tolerance and concentration. There are no saved profiles. Name and age are display-only: no rule reads them, they are stored with the audit record, and they are never sent to the AI service.
- **Verdict rules** are in [docs/suitability-rules.md](docs/suitability-rules.md); payoff formulas in [docs/product-formulas.md](docs/product-formulas.md).

## Architecture

```text
React web app (3000) ──/api──▶ Node.js API (4000) ──▶ forecast service (8000)    Mode A paths
                                    │            └──▶ explanation service (8001)  Gemini + knowledge base
                                    ├──▶ market data: Finnhub / Upstox (live), Frankfurter (FX), Yahoo (history)
                                    └──▶ Supabase (PostgreSQL): audit records
```

| Part                | Where               | Notes                                                             |
| ------------------- | ------------------- | ----------------------------------------------------------------- |
| Web app             | `apps/web`          | React + TypeScript + Vite                                         |
| API                 | `apps/api`          | Express 5 + TypeScript: routes → controllers → services → engines |
| Shared schemas      | `packages/shared`   | Zod schemas and types used by both                                |
| Database schema     | `supabase/`         | SQL migrations and Supabase CLI config                            |
| Forecast service    | `services/forecast` | Python; owned by the AI/ML developer                              |
| Explanation service | `services/rag`      | Python; owned by the AI/ML developer                              |

More detail: [ARCHITECTURE.md](ARCHITECTURE.md), [API_SPEC.md](API_SPEC.md), [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## Getting started

**Needs:** Node.js 22+, Python 3.11+, and a [Supabase](https://supabase.com) project if you want records saved.

```sh
npm run setup      # creates .env files, installs packages, builds a .venv per Python service
```

`setup` is safe to re-run. It never overwrites an existing `.env`, and it generates the keys that let the API talk to the two Python services.

Then start each part in its own terminal:

```sh
npm run dev:forecast   # http://127.0.0.1:8000   Mode A forecasts
npm run dev:rag        # http://127.0.0.1:8001   explanations and chat
npm run dev:api        # http://127.0.0.1:4000   backend
npm run dev:web        # http://localhost:3000   open this one
```

Run all four **as your normal user** in your own terminals. Servers started by a sandboxed tool can lack network access (see Troubleshooting).

### Configuration

Root `.env` (copied from [.env.example](.env.example)):

| Variable                                    | Needed for                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Saving audit records. Both or neither. The URL is the bare project URL, e.g. `https://<ref>.supabase.co` (no `/rest/v1`). Required in production. |
| `AI_API_URL`, `AI_API_KEY`                  | Mode A. Set by `setup`.                                                                                                                           |
| `RAG_API_URL`, `RAG_API_KEY`                | Explanation and chat. Set by `setup`.                                                                                                             |
| `FINNHUB_API_KEY` or `UPSTOX_ACCESS_TOKEN`  | Optional live level in Mode B. Without one, the RM types the level.                                                                               |
| `MARKET_HISTORY_PROVIDER`                   | `yahoo` shows price history behind the Mode A fan chart; default `none`.                                                                          |
| `SUITABILITY_CONCENTRATION_LIMIT_PCT`       | Concentration flag threshold, default 25.                                                                                                         |
| `AUTH_JWT_SECRET`                           | Signs access tokens (32+ characters). Set by `setup`. Required in production.                                                                     |
| `AUTH_ENFORCED`, `PAYLOAD_HASH_REQUIRED`    | Default on in production, off in development. See Accounts below.                                                                                 |

`services/rag/.env` needs `GOOGLE_API_KEY` (a Gemini key). After adding it, build the knowledge-base index once with `npm run rag:index`, and again whenever you edit `services/rag/rag/knowledge/`.

The app runs without Supabase or any live-price key. Without Supabase nothing is saved, and the verdict says so.

### Database (Supabase)

The schema is the SQL in `supabase/migrations/`. The Supabase CLI is installed with the project.

```sh
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push        # apply the migrations
```

Put the project URL and the service-role (or `sb_secret_…`) key in `.env`. **Keep that key server-side only**; it bypasses row-level security. The schema locks the public keys out entirely, and the database rejects any update or delete of audit records.

For a local database run `npx supabase start` (needs Docker).

### Accounts and sign-in

Staff sign in with an email and password; sessions use httpOnly cookies (an access token and a rotating refresh token). Accounts live in Supabase, so apply the migrations first. There are two roles:

| Role         | Can do                                                                                  |
| ------------ | --------------------------------------------------------------------------------------- |
| `RM` ("User") | Run simulations, suitability checks, explanations and chat; see their own saved runs.    |
| `ADMIN`      | Everything a user can do, plus every account's runs, the activity log and analytics, and user management. |

Anyone can register as a user. Create the first admin from your terminal, then sign in on the same page (users and admins share it) to reach the admin console and create further admin accounts:

```sh
ADMIN_EMAIL=you@bank.com ADMIN_PASSWORD='Strong-Passw0rd' npm run seed:admin
```

In development, sign-in is optional (the simulator is open to anonymous visitors, and the sign-in button is in the settings menu); in production (`NODE_ENV=production`) it is required. Every user can switch between light, dark and system themes, and turn the custom cursor off, in the account menu; the choice is saved to their account. The web app sends a SHA-256 hash of every request body (`X-Payload-Hash`) and the API checks it. Decision record and known limits: [docs/decisions/2026-10-07-auth-rbac.md](docs/decisions/2026-10-07-auth-rbac.md).

## Everyday commands

| Command                                   | What it does                                      |
| ----------------------------------------- | ------------------------------------------------- |
| `npm run typecheck`                       | Type-check every package                          |
| `npm run lint`                            | ESLint                                            |
| `npm test`                                | API and web unit and integration tests            |
| `npm run test:e2e`                        | Browser tests (run `npx playwright install` once) |
| `npm run build:web` / `npm run build:api` | Production builds                                 |
| `npm run format`                          | Prettier                                          |

Python tests run with each service's own environment, e.g. from `services/forecast`: `.venv/Scripts/python -m pytest` on Windows, `.venv/bin/python -m pytest` elsewhere.

Tests against a real database are skipped unless you set `SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY` and `SUPABASE_TEST_DB_URL` (a **local** database; the suite empties its tables). See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## API

All under `/api`: `GET /health`, `POST /configure`, `POST /simulate`, `POST /suitability`, `POST /explain`, `POST /chat`, a WebSocket `/live` for the price ticker, and the account routes `/auth/*`, `/admin/*` and `/audit/*`. Request and response shapes: [API_SPEC.md](API_SPEC.md).

## Keeping Mode A fresh

Mode A fails with `DATA_STALE` when the forecast service's price file (`services/forecast/data/nifty50_clean.csv`) is more than 5 days old. Refresh it from `services/forecast` with `.venv/Scripts/python -m forecast_service.refresh` (try `--dry-run` first), and schedule it. See [docs/market-data.md](docs/market-data.md).

## Troubleshooting

| You see                                                                       | Cause and fix                                                                                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Supabase is unreachable (… EACCES …)` or the explanation service returns 502 | The server was started by a sandboxed account with no internet (for example `CodexSandboxOffline`). Stop it and start it from your own terminal. |
| `Database schema is missing; apply supabase/migrations`                       | The tables don't exist yet. Run `npx supabase db push`.                                                                                          |
| `Supabase answered HTTP 404 without a database error; check SUPABASE_URL`     | `SUPABASE_URL` has a path such as `/rest/v1`. Use the bare project URL.                                                                          |
| `Supabase rejected the service credentials`                                   | Wrong or revoked key. Use the service-role (or `sb_secret_…`) key, not the publishable one.                                                      |
| `AI_UNAVAILABLE` on a forecast                                                | The forecast service isn't running, or its key doesn't match `AI_API_KEY`. Start `npm run dev:forecast`.                                         |
| `DATA_STALE`                                                                  | See "Keeping Mode A fresh".                                                                                                                      |
| `http://127.0.0.1:3000` doesn't load                                          | The dev server may listen on IPv6 only. Use `http://localhost:3000`.                                                                             |
| Run button disabled                                                           | The client's name and age must be entered, and the product terms must be valid.                                                                  |

## Project rules and status

- [PRD.md](PRD.md) is the source of truth for requirements. Changes to architecture, API contracts, the database design or financial rules need explicit approval. See [CLAUDE.md](CLAUDE.md).
- The Mode A forecast contract between this repo and the AI/ML developer is [docs/forecasting.md](docs/forecasting.md).
- What is built, what is verified and what is still open: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Open decisions: [docs/decisions/](docs/decisions/).
- Security notes: [SECURITY.md](SECURITY.md).

`Frontend/` and `ML/` at the repository root are older copies of the web app and forecast service from before the workspace layout. The live code is in `apps/web` and `services/forecast`.
