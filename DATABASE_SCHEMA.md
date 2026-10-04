# DATABASE_SCHEMA.md

Firebase SQL Connect (PostgreSQL) is the only database (Supabase removed 2026-10-04). It is accessed through repository interfaces and the Firebase adapter; the business domain does not depend on the SDK.

Provider-specific transformations stay in the adapter. There is no fallback, failover, dual-write, replication or synchronization.

Source of truth: `dataconnect/schema/schema.gql`. Schema changes go through this file; SQL Connect generates and applies the PostgreSQL migration.

## Decisions (Karan, 2026-10-04)

- **Client profile units:** risk appetite `LOW` / `MEDIUM` / `HIGH`; horizon in months; loss tolerance in percent of notional; concentration in percent of portfolio (percent numbers, 0–100).
- **Client identity:** only the RM's own reference (`client_ref`, unique) and an optional label. No names, contact details or account numbers.
- **Audit record:** a simulation links to the saved profile **and** keeps a frozen `profile_snapshot`, so editing or deleting a profile never changes the evidence. Product configurations are never edited, so the linked configuration is the frozen terms.
- **Columns:** typed columns for what is queried or audited; full product terms and engine output as JSON (`jsonb`).

## Conventions

- Percent fields are percent numbers (95 = 95%). Probabilities are fractions (0.17 = 17%).
- Range checks are enforced by the backend's Zod schemas before any write. SQL Connect has no `CHECK` constraints.
- Timestamps are `timestamptz`, set by the server (`request.time`).

## Enums

| Enum                  | Values                                |
| --------------------- | ------------------------------------- |
| `risk_appetite`       | `LOW`, `MEDIUM`, `HIGH`               |
| `product_type`        | `ELN`, `DCD`, `CPN`                   |
| `simulation_mode`     | `A`, `B`                              |
| `level_source`        | `LIVE`, `MANUAL`, `REFERENCE`         |
| `scenario_case`       | `LOW`, `BASE`, `HIGH`, `SHOCK`        |
| `suitability_verdict` | `SUITABLE`, `CAUTION`, `NOT_SUITABLE` |

## Tables

**`client_profiles`**: `id` (uuid, PK), `client_ref` (varchar 64, unique), `label` (varchar 120, null), `risk_appetite`, `horizon_months` (int), `loss_tolerance_pct`, `concentration_pct` (double), `created_at`, `updated_at`.

**`product_configurations`**: `id` (uuid, PK), `product_type`, `underlying_symbol` (varchar 32; ELN/CPN), `deposit_currency`, `alternate_currency` (char 3; DCD), `tenor_days` (int), `notional` (double; notional or deposit amount), `terms` (jsonb; normalized terms from `/api/configure`), `created_at`.

**`simulations`**: `id` (uuid, PK), `profile_id` (FK → client_profiles, null, `ON DELETE SET NULL`), `configuration_id` (FK → product_configurations), `mode`, `profile_snapshot` (jsonb, null), then:

- Mode B: `level_value`, `level_source`, `level_as_of` (varchar 32; ISO timestamp or date, null for manual), `shock_pct`, `shocked_level`.
- Mode A: `training_window_years`, `forecast_meta` (jsonb: contract version, model, data, horizon, terminal quantiles, case terminals, backtest; no sample paths or fan, PRD §7.2), `path_count`, `probability_of_loss`, `probability_of_knock_in` (null without a barrier), `payoff_p5`, `payoff_p50`, `payoff_p95`.
- `created_at`.

**`risk_results`**: PK (`simulation_id`, `scenario`). `percentile` (int, Mode A only), `terminal`, `path_min` (Mode A only), `payoff`, `return_pct`, `loss_amount`, `knocked_in` (null without a barrier), `details` (jsonb, engine output), `created_at`. Mode A writes `LOW`/`BASE`/`HIGH`; Mode B writes `SHOCK`.

**`suitability_results`**: `id` (uuid, PK), `simulation_id` (FK, unique: one verdict per simulation), `verdict`, `flags` (jsonb: rule, severity, reason for every raised flag), `rules_version` (varchar 32), `created_at`.

**`explanations`**: `id` (uuid, PK), `simulation_id` (FK), `text`, `model` (varchar 120), `sources` (jsonb, null), `created_at`.

## Deletes

SQL Connect makes a required foreign key `ON DELETE CASCADE` and an optional one `ON DELETE SET NULL`; the schema cannot override this. Deleting a product configuration or simulation would therefore delete its audit trail. Rule: **no delete operations** are defined for `product_configurations`, `simulations`, `risk_results`, `suitability_results` or `explanations`. The application can only run operations defined in connectors, so this is enforced there. Deleting a client profile (if approved) clears `simulations.profile_id` and keeps `profile_snapshot`.

## Validation

The schema was compiled by the SQL Connect emulator (firebase-tools 15.32.1, `demo-` project) on 2026-10-04. It created every enum, table, key and foreign key listed above.

## Connectors (operations)

`dataconnect/connector/` (connector `backend`) defines the only operations the backend may run. All are server-only (`@auth(level: NO_ACCESS)`); there are no delete operations.

| Operation                                                         | Purpose                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `CreateClientProfile`, `UpdateClientProfile`                      | Create; full replacement of editable fields (returns null for an unknown id) |
| `GetClientProfile`, `GetClientProfileByRef`, `ListClientProfiles` | Read by id, by `client_ref`, or page by most recently updated                |
| `CreateProductConfiguration`, `GetProductConfiguration`           | Create and read (never updated)                                              |
| `RecordSimulation`                                                | Simulation plus all its risk results in one atomic insert                    |
| `GetSimulation`, `ListSimulationsForProfile`                      | Full audit record; a client's simulations newest first                       |
| `CreateSuitabilityResult`, `CreateExplanation`                    | One verdict per simulation; explanations                                     |

Verified against the SQL Connect emulator on 2026-10-04: every operation, both unique rules (`client_ref`, one verdict per simulation), and atomicity (a failed `RecordSimulation` writes nothing). Notes for the adapter: SQL Connect returns UUIDs without hyphens, so the adapter normalizes them; `@allow(maxCount)` counts list elements more than once, so the risk-result limit (at most 4) is enforced by the repository layer instead.

## Repository layer

`apps/api/src/repositories/interfaces/` defines the records, the repository interfaces (no delete methods), database-neutral errors (`not_configured`, `unavailable`, `conflict`, `invalid_reference`, `invalid_input`) and the shared input rules (Mode A stores exactly low/base/high results, Mode B exactly one shock result). Every implementation must pass `apps/api/tests/contract/repositoryContract.ts`; a test-only in-memory implementation passes it now, and the Firebase SQL Connect adapter must pass it against the emulator.

## Firebase adapter

`apps/api/src/repositories/firebase/`: `dataConnectRunner.ts` is the only code that uses the Firebase SDK. It runs the connector's named operations (`executeQuery` / `executeMutation`, never ad-hoc GraphQL) with admin credentials, and maps every failure to a `RepositoryError`: unique violation → `conflict`, foreign-key violation → `invalid_reference`, credential or network failure → `unavailable`, missing settings → `not_configured`. `mapping.ts` converts enums, UUIDs (SQL Connect returns 32 hex digits) and timestamps (microseconds → ISO milliseconds). `firebaseRepositories.ts` implements the interfaces and passes the full contract suite on the emulator (24/24, 2026-10-04).

## Testing against the emulator

`apps/api/tests/emulator/firebaseRepositories.emulator.test.ts` runs the contract suite against the SQL Connect emulator and is skipped when no emulator is running. It empties the tables between tests with a test-only helper that refuses to run unless `DATA_CONNECT_EMULATOR_HOST` is set. With the Firebase CLI installed and `dataconnect/dataconnect.yaml` filled in (or a copy with test values):

```bash
firebase emulators:exec --only dataconnect --project demo-mindspark   "cd apps/api && npx vitest run tests/emulator"
```

`FDC_TEST_SERVICE_ID` and `FDC_TEST_LOCATION` must match the service ID and location in `dataconnect.yaml` (defaults `mindspark`, `asia-south1`).
