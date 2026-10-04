# Implementation Plan

How we build the full RM workflow from `PRD.md` v2.0.

**Split of work**

| Area     | Who               | Where                                                        |
| -------- | ----------------- | ------------------------------------------------------------ |
| Frontend | This repo         | `apps/web`                                                   |
| Backend  | This repo         | `apps/api`                                                   |
| Database | This repo         | `supabase/` (Supabase, SQL migrations)                       |
| ML / AI  | Karan, separately | Own service. This repo only calls its endpoints (section 4). |

**The flow we are building**

```text
Dashboard → pick product → enter terms → client profile → pick Mode A or B
   → POST /api/simulate → payoff + risk
   → POST /api/suitability → verdict + flags
   → POST /api/explain → plain-language summary
   → results page → POST /api/chat
```

---

## 0. Decide first (blocks the payoff code)

Write each answer into `docs/product-formulas.md` or `docs/suitability-rules.md`. Each one becomes a test.

| Question                                     | Suggested answer                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| Coupon year fraction `T`                     | `tenorDays / 365`                                                         |
| Strike and barrier                           | % of starting level `S_0`                                                 |
| Does touching the barrier count as knock-in? | Yes                                                                       |
| DCD base currency                            | The deposit currency                                                      |
| American barrier in Mode B (no daily path)   | Knock in if the shocked value breaches the barrier; say so in the UI      |
| Verdict mapping                              | Any "hard" flag → Not suitable; any other flag → Caution; none → Suitable |
| Product risk ratings                         | CPN = Low, DCD = High, ELN = High                                         |
| Worked payoff examples                       | Needed from the product notes, used as test fixtures                      |

---

## 1. Frontend (`apps/web`)

React + TypeScript + Vite. Uses the shared Zod schemas from `@mindspark/shared` for instant form checks. The server's numbers are always the final answer.

### Screens

| #   | Screen             | What it does                                                                                     |
| --- | ------------------ | ------------------------------------------------------------------------------------------------ |
| 1   | **Dashboard**      | Three cards: ELN, DCD, CPN                                                                       |
| 2   | **Product form**   | One form per product (fields in PRD §3). Tenor 30–1,095 days, barrier below strike, notional > 0 |
| 3   | **Client profile** | Name, age, risk appetite, horizon, loss tolerance, concentration (no saved profiles, 2026-10-04) |
| 4   | **Mode picker**    | Mode A (forecast) or Mode B (shock: −10%, 0%, +x%, custom)                                       |
| 5   | **Results**        | Everything below, plus the "simulation, not a guarantee" notice                                  |

### Results page parts

- [ ] **Payoff chart:** payoff vs underlying level, with strike, barrier and breakeven marked. ELN barrier "cliff" and DCD capped gain highlighted.
- [ ] **Scenario table:** −25%, −10%, 0%, +15% → payoff in ₹ and %.
- [ ] **Mode A fan chart:** price history, P5–P95 band, base line, low/base/high paths, strike and barrier lines.
- [ ] **Model card (Mode A):** training window, model name, backtest coverage and error.
- [ ] **Risk panel:** payoff, return and knock-in for low/base/high. In Mode A also probability of loss and probability of knock-in.
- [ ] **Suitability badge:** Suitable / Caution / Not suitable, with the list of flags.
- [ ] **Explanation panel** and **chat box**.
- [ ] Mode A wording is always a range: "Base ₹X, likely range ₹L–₹H".

### Folder layout (already scaffolded)

```text
src/components/dashboard   src/components/products/{ELN,DCD,CPN}
src/components/client      src/components/simulation
src/components/charts      src/components/risk
src/components/suitability src/components/chat
src/services   → API calls      src/hooks → data hooks
```

---

## 2. Backend (`apps/api`)

Node.js + TypeScript + Express 5 + Zod.

### Endpoints this repo exposes

| Method | Path               | Input                              | Output                                                                                                                       |
| ------ | ------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`      | —                                  | Status and database config                                                                                                   |
| POST   | `/api/configure`   | Product type + terms               | Validated, normalized terms or `VALIDATION_ERROR`                                                                            |
| POST   | `/api/simulate`    | Terms + mode (A or B) + shock (B)  | Mode B: payoff at the shocked level. Mode A: low/base/high results, probabilities, fan chart data, model card, price history |
| POST   | `/api/suitability` | Simulation result + client profile | Verdict + list of flags with reasons. Saves the simulation record                                                            |
| POST   | `/api/explain`     | Simulation id                      | Plain-language explanation (from the ML service)                                                                             |
| POST   | `/api/chat`        | Simulation id + question           | Answer (from the ML service)                                                                                                 |

`/api/client-profiles` was added and then removed on 2026-10-04: the RM now enters the client for each run, so there is no saved profile to load.

### Error codes

| Code                  | HTTP | When                             |
| --------------------- | ---- | -------------------------------- |
| `VALIDATION_ERROR`    | 400  | Bad input                        |
| `NOT_FOUND`           | 404  | Unknown simulation or profile id |
| `AI_UNAVAILABLE`      | 503  | ML service down or timed out     |
| `AI_INVALID_RESPONSE` | 502  | ML response broke the contract   |
| `DATABASE_ERROR`      | 500  | The database failed              |

### Build steps

1. [ ] **Server setup:** `src/server.ts`, Express app, error middleware, `.env` loader, `/api/health`.
2. [ ] **Input schemas** in `packages/shared/src/schemas/`: ELN, DCD, CPN terms; client profile; simulate request.
3. [ ] **`/api/configure`.**
4. [ ] **Payoff engines** in `src/engines/payoff/{eln,dcd,cpn}`: pure functions `(terms, path) → payoff`. Tested against the worked examples.
5. [ ] **Risk engine** in `src/engines/risk`: return %, loss, breakeven, scenario table.
6. [ ] **Market data service** in `src/services/market-data`: live level + daily history. Never fills gaps or fakes data.
7. [ ] **`/api/simulate` Mode B:** live level × (1 + shock) → engines.
8. [ ] **`/api/simulate` Mode A:** forecast client → case paths → engines → probabilities.
   - Done: forecast client, response checks, case and probability helpers, 30 unit tests.
9. [ ] **Suitability engine** in `src/engines/suitability` + **`/api/suitability`**.
10. [ ] **`/api/explain`** and **`/api/chat`:** send only computed numbers to the ML service; return its text.
11. [ ] **Tests:** unit per engine, integration per endpoint with a stubbed ML service.

---

## 3. Database

Supabase is the only database (approved 2026-10-04). Code talks to repository interfaces, never to the SDK directly.

```text
Controller → Service → Repository interface → Supabase adapter
```

### Tables

| Table                    | Key columns                                                                                                       | Written by     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------- |
| `product_configurations` | id, product_type, terms (json), created_at                                                                        | `/configure`   |
| `simulations`            | id, config_id, mode, profile_snapshot (json: name, age, rule fields), shock_pct, forecast_meta (json), created_at | `/suitability` |
| `risk_results`           | id, simulation_id, case (low/base/high/shock), terminal, payoff, return_pct, knocked_in, prob_loss, prob_knock_in | `/simulate`    |
| `suitability_results`    | id, simulation_id, verdict, flags (json), created_at                                                              | `/suitability` |
| `explanations`           | id, simulation_id, text, model, created_at                                                                        | `/explain`     |

`forecast_meta` holds the model, training window, as-of date, case end values and backtest. Sample paths and the fan chart are **not** stored.

### Build steps

1. [x] SQL migration in `supabase/migrations/` (final columns in `DATABASE_SCHEMA.md`, which supersedes the table above).
2. [x] `record_simulation` function for the atomic simulation write; audit tables append-only by trigger; RLS on with no policies.
3. [x] Repository interfaces in `src/repositories/interfaces`, with a shared contract test suite (`tests/contract/repositoryContract.ts`).
4. [x] Supabase adapter (`src/repositories/supabase`). Database unavailable → `DATABASE_ERROR`; not configured → `DATABASE_NOT_CONFIGURED`. No fallback.
5. [x] Adapter tests against a local database (`tests/supabase`: contract suite, append-only check, app flow).

---

## 4. ML endpoints (built separately by Karan)

This repo only calls these. Base URL `AI_API_URL`, header `Authorization: Bearer AI_API_KEY`.

| Method | Path        | Used by                | Status                                    |
| ------ | ----------- | ---------------------- | ----------------------------------------- |
| POST   | `/forecast` | `/api/simulate` Mode A | **Contract fixed:** `docs/forecasting.md` |
| POST   | `/explain`  | `/api/explain`         | Contract proposed below                   |
| POST   | `/chat`     | `/api/chat`            | Contract proposed below                   |

### `POST /forecast` (summary)

- **Request:** `underlying {symbol, assetClass}`, `tenorDays` (30–1,095), `trainingWindowYears` (5 or 10), `samplePathCount` (100–2,000).
- **Response:** low/base/high daily paths, end-value percentiles, fan chart series, sample paths, model info, training window, backtest.
- The backend rejects anything that doesn't match `docs/forecasting.md` exactly.

### `POST /explain` (proposed)

```jsonc
// request
{ "product": {...terms}, "profile": {...}, "results": {...payoff and risk}, "suitability": { "verdict": "Caution", "flags": [...] }, "forecast": { "low": 0, "base": 0, "high": 0 } }
// response
{ "text": "...", "sources": ["eln-notes#risks"], "model": "..." }
```

### `POST /chat` (proposed)

```jsonc
// request
{ "context": { ...same as /explain }, "history": [{ "role": "user", "text": "..." }], "question": "..." }
// response
{ "text": "...", "inScope": true, "sources": [...] }
```

**Rule for all three:** the ML service never sends back payoff, risk or suitability numbers the backend uses. It only forecasts prices and writes text.

---

## 5. Order of work

| Week | Frontend                                 | Backend                                             | Database                                | ML (Karan)                                                  |
| ---- | ---------------------------------------- | --------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| 1    | Layout, dashboard, product forms         | Decisions (§0), server setup, schemas, `/configure` | Schema + migration                      | `/forecast` model and simulation                            |
| 2    | Client profile, mode picker              | Payoff + risk engines, Mode B                       | Repository interfaces, Supabase adapter | `/forecast` backtest, caching, share a real sample response |
| 3    | Results page: charts, risk panel         | Mode A, suitability, market data                    | Connectors, adapter tests               | `/explain` with RAG                                         |
| 4    | Fan chart, model card, explanation, chat | `/explain`, `/chat`, integration tests              | Persistence tests                       | `/chat` + guardrails                                        |
| 5    | End-to-end tests, polish                 | Bug fixes, security check                           | —                                       | Support end-to-end tests                                    |

## 6. Done when (PRD §9)

- [ ] Card → full result in a few minutes; forecast returns in under 10 s.
- [ ] Payoffs match the worked examples.
- [ ] Every simulation gets a verdict with reasons, saved in the database.
- [ ] Explanations match the computed numbers.
- [ ] Mode A and Mode B work for ELN, DCD and CPN.
- [ ] Forecast band coverage 80–95% for Nifty 50 at 3, 6 and 12 months.
