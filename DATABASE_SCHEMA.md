# DATABASE_SCHEMA.md

Supabase (PostgreSQL) is the only database (approved 2026-10-04). It is accessed through repository interfaces and the Supabase adapter; the business domain does not depend on the SDK.

Provider-specific transformations stay in the adapter. There is no fallback, failover, dual-write, replication or synchronization.

Source of truth: `supabase/migrations/`. Every schema change is a new, timestamped migration file; applied migrations are never edited.

## Decisions (Karan, 2026-10-04)

- **No saved client profiles.** The RM enters the client for each run; nothing is saved to be loaded later. Migration `20261004130000_remove_client_profiles.sql` dropped `client_profiles` and `simulations.profile_id`.
- **Client on the audit record:** each simulation stores the client as entered in `profile_snapshot` (jsonb): `name`, `age`, `riskAppetite` (`low` / `medium` / `high`), `horizonMonths`, `lossTolerancePct` (percent of notional) and `concentrationPct` (percent of portfolio). This reverses the earlier "no client names" decision: the name and age are personal data, so treat the database accordingly (service-role key server-only, no public access, see below). Age is display-only; no suitability rule reads it, and neither field is ever sent to the AI service.
- **Columns:** typed columns for what is queried or audited; full product terms and engine output as JSON (`jsonb`).

## Conventions

- Percent fields are percent numbers (95 = 95%). Probabilities are fractions (0.17 = 17%).
- Range checks are enforced by the backend's Zod schemas before any write; the schema has no `CHECK` constraints for them.
- Timestamps are `timestamptz`, set by the database (`now()`).

## Enums

| Enum                  | Values                                |
| --------------------- | ------------------------------------- |
| `product_type`        | `ELN`, `DCD`, `CPN`                   |
| `simulation_mode`     | `A`, `B`                              |
| `level_source`        | `LIVE`, `MANUAL`, `REFERENCE`         |
| `scenario_case`       | `LOW`, `BASE`, `HIGH`, `SHOCK`        |
| `suitability_verdict` | `SUITABLE`, `CAUTION`, `NOT_SUITABLE` |
| `user_role`           | `RM`, `ADMIN`                         |

## Tables

**`product_configurations`**: `id` (uuid, PK), `product_type`, `underlying_symbol` (varchar 32; ELN/CPN), `deposit_currency`, `alternate_currency` (char 3; DCD), `tenor_days` (int), `notional` (double; notional or deposit amount), `terms` (jsonb; normalized terms from `/api/configure`), `created_at`.

**`simulations`**: `id` (uuid, PK), `configuration_id` (FK → product_configurations, `ON DELETE RESTRICT`), `mode`, `profile_snapshot` (jsonb, null; the client as entered, see Decisions), then:

- Mode B: `level_value`, `level_source`, `level_as_of` (varchar 32; ISO timestamp or date, null for manual), `shock_pct`, `shocked_level`.
- Mode A: `training_window_years`, `forecast_meta` (jsonb: contract version, model, data, horizon, terminal quantiles, case terminals, backtest; no sample paths or fan, PRD §7.2), `path_count`, `probability_of_loss`, `probability_of_knock_in` (null without a barrier), `payoff_p5`, `payoff_p50`, `payoff_p95`.
- `created_at`.

Indexes: `configuration_id`.

**`risk_results`**: PK (`simulation_id`, `scenario`), FK `ON DELETE RESTRICT`. `percentile` (int, Mode A only), `terminal`, `path_min` (Mode A only), `payoff`, `return_pct`, `loss_amount`, `knocked_in` (null without a barrier), `details` (jsonb, engine output), `created_at`. Mode A writes `LOW`/`BASE`/`HIGH`; Mode B writes `SHOCK`.

**`suitability_results`**: `id` (uuid, PK), `simulation_id` (FK, unique: one verdict per simulation), `verdict`, `flags` (jsonb: rule, severity, reason for every raised flag), `rules_version` (varchar 32), `created_at`.

**`explanations`**: `id` (uuid, PK), `simulation_id` (FK), `text`, `model` (varchar 120), `sources` (jsonb, null), `created_at`. Index (`simulation_id`, `created_at`).

**`app_users`** (migration `20261007100000_auth_users.sql`, approved 2026-10-07): `id` (uuid, PK), `email` (varchar 254; unique on `lower(email)`), `display_name` (varchar 80), `password_hash` (text; salted scrypt, never plain text), `role` (`user_role`, default `RM`), `active` (boolean), `settings` (jsonb: `theme`, `customCursor`), `created_at`, `updated_at` (trigger), `last_login_at`. Not audit evidence: users are deactivated, not deleted.

**`refresh_tokens`**: `id` (uuid, PK), `user_id` (FK → app_users, `ON DELETE CASCADE`), `family_id` (uuid; one per sign-in), `token_hash` (char 64, unique; SHA-256 of the cookie value, the token itself is never stored), `expires_at`, `revoked_at`, `replaced_by` (FK → refresh_tokens; set on rotation), `created_at`. Indexes: `user_id`, `family_id`. Both tables have RLS on with no policies, like the others.

## Functions

| Function                                                         | Purpose                                                                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `record_simulation(simulation jsonb, risk_results jsonb) → uuid` | Inserts a simulation and all its risk results in one transaction, so an audit record is never partial. Executable by `service_role` only. |
| `reject_audit_change()` (trigger)                                | Rejects `UPDATE` and `DELETE` on the five audit tables (SQLSTATE `42501`).                                                                |

## Access and deletes

- The API uses the **service-role key**, which is server-only. Row-level security is enabled on every table with **no policies**, and all table privileges are revoked from `anon` and `authenticated`, so the public keys can read or write nothing.
- The service-role key bypasses RLS, so append-only is enforced in the database itself: `product_configurations`, `simulations`, `risk_results`, `suitability_results` and `explanations` reject every `UPDATE` and `DELETE`, whoever sends it. Foreign keys to them are `ON DELETE RESTRICT`.
- The repository interfaces have no delete methods.

## Repository layer

`apps/api/src/repositories/interfaces/` defines the records, the repository interfaces (no delete methods), database-neutral errors (`not_configured`, `unavailable`, `conflict`, `invalid_reference`, `invalid_input`) and the shared input rules (Mode A stores exactly low/base/high results, Mode B exactly one shock result, at most 4 rows). Every implementation must pass `apps/api/tests/contract/repositoryContract.ts`; the test-only in-memory implementation and the Supabase adapter both run it.

## Supabase adapter

`apps/api/src/repositories/supabase/`:

- `supabaseClient.ts` is the only code that imports `@supabase/supabase-js`. It builds the client from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (no session persistence, 10 s timeout per request) and maps every failure to a `RepositoryError`: unique violation (`23505`) → `conflict`, foreign-key violation (`23503`) → `invalid_reference`, malformed value (`22P02`) → `invalid_input`, rejected key or JWT (401/403, `PGRST30x`) → `unavailable`, missing table or function (`PGRST205`, `PGRST202`; schema not applied) → `unavailable`, network failure or timeout → `unavailable` ("Supabase is unreachable"), an HTTP answer without a database error code (usually a wrong `SUPABASE_URL`) → `unavailable`, missing settings → `not_configured`. supabase-js retries reads (GET) up to 3 times on network errors and 503/520 responses; writes are not retried.
- `mapping.ts` converts enums and timestamps (microseconds → ISO milliseconds).
- `supabaseRepositories.ts` implements the interfaces with PostgREST queries (snake_case columns, mapped to the application's camelCase records) and the `record_simulation` RPC. The profile snapshot is stored as-is, in the application's vocabulary.

## Wiring

`apps/api/src/app.ts` builds the Supabase repositories when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are both set (both are required in production). `apps/api/src/services/persistence/persistenceService.ts` writes the audit record at `/api/suitability` (configuration, simulation + risk results + profile snapshot, verdict) and the explanation at `/api/explain`; Repository errors map to API errors: `not_configured` → `DATABASE_NOT_CONFIGURED`, `unavailable` → `DATABASE_ERROR`, `conflict` → `CONFLICT`, `invalid_reference` → `NOT_FOUND`. There is no fallback store. `/api/health` reports `database: { provider: "supabase", configured }`.

## Applying the schema

The Supabase CLI is a root dev dependency (`npx supabase …`).

- **Local:** `npx supabase start` (needs Docker) runs Postgres, PostgREST and Studio and applies every migration. `npx supabase status` prints the API URL (`http://127.0.0.1:54321`), the database URL (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) and the service-role key. `npx supabase db reset` re-applies the migrations from scratch.
- **Hosted project:** `npx supabase link --project-ref <ref>`, then `npx supabase db push`. Put the project URL and the service-role (or `sb_secret_…`) key in `.env`.

## Testing against a local Supabase

`apps/api/tests/supabase/supabaseRepositories.local.test.ts` runs the repository contract, an append-only check, a check that the client-profile table and column are gone, an atomicity check (a failed write leaves no rows) and the whole-app persistence flow (`persistenceFlow.ts`) against a real database. It is skipped unless all three variables are set; it empties the tables between tests with `TRUNCATE` and refuses to do so unless the database host is local.

```bash
npx supabase start
SUPABASE_TEST_URL=http://127.0.0.1:54321 \
SUPABASE_TEST_SERVICE_ROLE_KEY=<service_role key from `npx supabase status`> \
SUPABASE_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  npx vitest run tests/supabase   # from apps/api
```

The browser tests (`npm run test:e2e`) write to that database when `SUPABASE_TEST_URL` and `SUPABASE_TEST_SERVICE_ROLE_KEY` are set; otherwise the API runs with no database.

**Still needed for production:** a Supabase project, `npx supabase db push` to apply the migration, and `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` on the API host.

## Runs linked to accounts, and the activity log (2026-10-08)

Migration `supabase/migrations/20261008100000_accounts_runs_activity.sql`:

- `user_role` is replaced by `RM`, `ADMIN`; accounts that had `COMPLIANCE` became `RM`.
- `simulations.user_id` (uuid, nullable, `references app_users(id) on delete restrict`, indexed with `created_at`): the account that ran the simulation. Written by `record_simulation`. Rows saved before the migration, or without a signed-in user, keep it null. Simulations stay append-only.
- `activity_events` (`id`, `user_id` nullable `on delete set null`, `actor_email`, `event` checked against the event names, `detail` jsonb, `created_at`; indexed by time and by user). Written by the API after sign-ups, sign-ins, sign-outs, account changes and saved runs; read by the admin only. RLS on, no policies, no access for `anon` or `authenticated`.
