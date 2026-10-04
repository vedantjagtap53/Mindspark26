-- MindSpark schema (Supabase / PostgreSQL). Logical model: DATABASE_SCHEMA.md.
-- Accessed only by the API's Supabase adapter (apps/api/src/repositories/supabase) with the
-- service-role key; RLS is on with no policies, so anon and authenticated keys see nothing.
--
-- Conventions
-- - Percent fields are percent numbers (95 = 95%), as in the API. Probabilities are fractions.
-- - Range checks (e.g. 0–100 %) are enforced by the backend's Zod schemas before any write.
-- - Typed columns hold what is queried or audited; full product terms and engine output are jsonb.
-- - Product configurations are never edited, so a simulation's configuration is its frozen terms.
--   Client profiles can be edited, so each simulation keeps a frozen copy of the profile it used.
-- - No client names or contact details: clients are identified by the RM's own reference.
-- - Audit evidence (product_configurations, simulations, risk_results, suitability_results,
--   explanations) can never be updated or deleted: triggers below reject it, even for the
--   service role. Deleting a client profile only clears simulations.profile_id; the frozen
--   profile_snapshot remains.

-- ---- enums ----

create type public.risk_appetite as enum ('LOW', 'MEDIUM', 'HIGH');
create type public.product_type as enum ('ELN', 'DCD', 'CPN');
create type public.simulation_mode as enum ('A', 'B');
-- Where a Mode B starting level came from.
create type public.level_source as enum ('LIVE', 'MANUAL', 'REFERENCE');
-- Mode A cases, or the single Mode B shock.
create type public.scenario_case as enum ('LOW', 'BASE', 'HIGH', 'SHOCK');
create type public.suitability_verdict as enum ('SUITABLE', 'CAUTION', 'NOT_SUITABLE');

-- ---- tables ----

create table public.client_profiles (
  id uuid primary key default gen_random_uuid(),
  -- The RM's internal reference for the client (e.g. a CRM id). Not a name.
  client_ref varchar(64) not null unique,
  label varchar(120),
  risk_appetite public.risk_appetite not null,
  horizon_months integer not null,
  -- Maximum acceptable loss, percent of notional (0–100).
  loss_tolerance_pct double precision not null,
  -- Share of the client's portfolio in this product or underlying, percent (0–100).
  concentration_pct double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_configurations (
  id uuid primary key default gen_random_uuid(),
  product_type public.product_type not null,
  -- ELN/CPN underlying symbol, e.g. ^NSEI. Null for DCD.
  underlying_symbol varchar(32),
  -- DCD currencies (ISO 4217). Null for ELN/CPN.
  deposit_currency char(3),
  alternate_currency char(3),
  tenor_days integer not null,
  -- Notional (ELN/CPN) or deposit amount (DCD).
  notional double precision not null,
  -- Normalized terms exactly as returned by POST /api/configure.
  terms jsonb not null,
  created_at timestamptz not null default now()
);

create table public.simulations (
  id uuid primary key default gen_random_uuid(),
  -- Saved profile used, if any. The frozen copy below is the audit record.
  profile_id uuid references public.client_profiles (id) on delete set null,
  configuration_id uuid not null references public.product_configurations (id) on delete restrict,
  mode public.simulation_mode not null,
  -- Client profile as it was at simulation time. Null when no profile was given.
  profile_snapshot jsonb,

  -- Mode B only
  level_value double precision,
  level_source public.level_source,
  -- ISO timestamp (live) or date (reference rate); null for a manual level.
  level_as_of varchar(32),
  shock_pct double precision,
  shocked_level double precision,

  -- Mode A only
  training_window_years integer,
  -- Contract version, model, data, horizon, terminal quantiles, case terminals, backtest.
  -- No sample paths or fan chart.
  forecast_meta jsonb,
  path_count integer,
  probability_of_loss double precision,
  -- Null when the product has no barrier.
  probability_of_knock_in double precision,
  payoff_p5 double precision,
  payoff_p50 double precision,
  payoff_p95 double precision,

  created_at timestamptz not null default now()
);

create index simulations_profile_id_created_at_idx on public.simulations (profile_id, created_at desc);
create index simulations_configuration_id_idx on public.simulations (configuration_id);

-- One row per scenario: LOW/BASE/HIGH for Mode A, SHOCK for Mode B.
create table public.risk_results (
  simulation_id uuid not null references public.simulations (id) on delete restrict,
  scenario public.scenario_case not null,
  -- Mode A case percentile (5/50/95); null for Mode B.
  percentile integer,
  -- S_T for ELN/CPN, X_T for DCD.
  terminal double precision not null,
  -- Lowest level on a Mode A case path; null for Mode B.
  path_min double precision,
  payoff double precision not null,
  return_pct double precision not null,
  loss_amount double precision not null,
  -- Null when the product has no barrier.
  knocked_in boolean,
  -- Product-specific engine output.
  details jsonb not null,
  created_at timestamptz not null default now(),
  primary key (simulation_id, scenario)
);

create table public.suitability_results (
  id uuid primary key default gen_random_uuid(),
  -- One verdict per simulation.
  simulation_id uuid not null unique references public.simulations (id) on delete restrict,
  verdict public.suitability_verdict not null,
  -- Every raised flag with its rule, severity (hard or not) and reason.
  flags jsonb not null,
  -- Version of the deterministic rule set that produced the verdict.
  rules_version varchar(32) not null,
  created_at timestamptz not null default now()
);

create table public.explanations (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations (id) on delete restrict,
  text text not null,
  -- Model that wrote the text, as reported by the AI service.
  model varchar(120) not null,
  -- Sources the AI service cited, if any.
  sources jsonb,
  created_at timestamptz not null default now()
);

create index explanations_simulation_id_created_at_idx on public.explanations (simulation_id, created_at);

-- ---- triggers ----

create function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger client_profiles_touch_updated_at
  before update on public.client_profiles
  for each row execute function public.touch_updated_at();

create function public.reject_audit_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% on % is not allowed: audit records are append-only', tg_op, tg_table_name
    using errcode = '42501';
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'product_configurations', 'simulations', 'risk_results', 'suitability_results', 'explanations'
  ] loop
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.reject_audit_change()',
      t || '_append_only', t
    );
  end loop;
end;
$$;

-- ---- atomic simulation write ----

-- Inserts a simulation and all of its risk results in one transaction, so an audit record is
-- never partial. Keys of both arguments are the column names above; the repository validates
-- the input (scenario set per mode, at most 4 rows) before calling.
create function public.record_simulation(simulation jsonb, risk_results jsonb) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.simulations (
    profile_id, configuration_id, mode, profile_snapshot,
    level_value, level_source, level_as_of, shock_pct, shocked_level,
    training_window_years, forecast_meta, path_count, probability_of_loss,
    probability_of_knock_in, payoff_p5, payoff_p50, payoff_p95
  )
  select
    s.profile_id, s.configuration_id, s.mode, s.profile_snapshot,
    s.level_value, s.level_source, s.level_as_of, s.shock_pct, s.shocked_level,
    s.training_window_years, s.forecast_meta, s.path_count, s.probability_of_loss,
    s.probability_of_knock_in, s.payoff_p5, s.payoff_p50, s.payoff_p95
  from jsonb_populate_record(null::public.simulations, simulation) as s
  returning id into new_id;

  insert into public.risk_results (
    simulation_id, scenario, percentile, terminal, path_min, payoff, return_pct,
    loss_amount, knocked_in, details
  )
  select
    new_id, r.scenario, r.percentile, r.terminal, r.path_min, r.payoff, r.return_pct,
    r.loss_amount, r.knocked_in, r.details
  from jsonb_populate_recordset(null::public.risk_results, risk_results) as r;

  return new_id;
end;
$$;

-- ---- access: server only ----

alter table public.client_profiles enable row level security;
alter table public.product_configurations enable row level security;
alter table public.simulations enable row level security;
alter table public.risk_results enable row level security;
alter table public.suitability_results enable row level security;
alter table public.explanations enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke execute on function public.record_simulation(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.reject_audit_change() from public, anon, authenticated;
grant execute on function public.record_simulation(jsonb, jsonb) to service_role;
