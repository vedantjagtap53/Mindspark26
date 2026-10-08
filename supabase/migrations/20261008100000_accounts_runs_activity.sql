-- Two roles, runs linked to accounts, and an activity log (requested by Karan, 2026-10-08).
--
-- 1. The Compliance role is removed. Accounts that had it become ordinary users (RM). Postgres
--    cannot drop a value from an enum, so the type is replaced.
-- 2. Every saved run now belongs to the account that ran it (simulations.user_id). Rows saved
--    before this migration, or without a signed-in user (development), keep user_id null.
-- 3. activity_events records what happens to accounts (sign-up, sign-in, role changes) and when a
--    run is saved. The admin console reads it. It never holds passwords, tokens or request bodies.
--
-- Everything stays server-only: RLS is on with no policies, as for the other tables.

-- ---- 1. roles: RM and ADMIN only ----

update public.app_users set role = 'RM' where role = 'COMPLIANCE';

alter type public.user_role rename to user_role_old;
create type public.user_role as enum ('RM', 'ADMIN');

alter table public.app_users alter column role drop default;
alter table public.app_users
  alter column role type public.user_role using role::text::public.user_role;
alter table public.app_users alter column role set default 'RM';

drop type public.user_role_old;

-- ---- 2. runs belong to accounts ----

-- Adding a column is DDL, so the append-only row triggers on simulations are not involved.
-- on delete restrict: an account with saved runs cannot be deleted (accounts are deactivated).
alter table public.simulations
  add column user_id uuid references public.app_users (id) on delete restrict;

create index simulations_user_id_created_at_idx on public.simulations (user_id, created_at desc);
create index simulations_created_at_idx on public.simulations (created_at desc);

create or replace function public.record_simulation(simulation jsonb, risk_results jsonb) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.simulations (
    user_id, configuration_id, mode, profile_snapshot,
    level_value, level_source, level_as_of, shock_pct, shocked_level,
    training_window_years, forecast_meta, path_count, probability_of_loss,
    probability_of_knock_in, payoff_p5, payoff_p50, payoff_p95
  )
  select
    s.user_id, s.configuration_id, s.mode, s.profile_snapshot,
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

revoke execute on function public.record_simulation(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_simulation(jsonb, jsonb) to service_role;

-- ---- 3. activity log ----

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  -- The account the event is about. Null for a failed sign-in whose email matched no account.
  -- on delete set null: the log outlives an account row.
  user_id uuid references public.app_users (id) on delete set null,
  -- The email typed at sign-in; kept for failed attempts so repeated guesses can be seen.
  actor_email varchar(254),
  event varchar(40) not null check (event in (
    'REGISTER', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT',
    'USER_CREATED', 'ROLE_CHANGED', 'USER_ACTIVATED', 'USER_DEACTIVATED',
    'RUN_SAVED'
  )),
  -- Small, non-sensitive facts (new role, product and verdict of a saved run, ...).
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_events_created_at_idx on public.activity_events (created_at desc);
create index activity_events_user_id_created_at_idx on public.activity_events (user_id, created_at desc);

alter table public.activity_events enable row level security;
revoke all on public.activity_events from anon, authenticated;
