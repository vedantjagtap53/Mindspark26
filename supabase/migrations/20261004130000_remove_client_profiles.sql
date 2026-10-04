-- Saved client profiles are removed (decided 2026-10-04). The client is entered per simulation:
-- name, age and the four suitability fields are stored in simulations.profile_snapshot (jsonb,
-- application vocabulary, e.g. {"name": "...", "age": 52, "riskAppetite": "high", ...}).
-- Name and age are display-only: no suitability rule reads them.
--
-- Existing snapshots written before this migration hold the old shape (clientRef, label,
-- uppercase riskAppetite); they are evidence and are left untouched.

-- The write function goes first: it names simulations.profile_id.
create or replace function public.record_simulation(simulation jsonb, risk_results jsonb) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.simulations (
    configuration_id, mode, profile_snapshot,
    level_value, level_source, level_as_of, shock_pct, shocked_level,
    training_window_years, forecast_meta, path_count, probability_of_loss,
    probability_of_knock_in, payoff_p5, payoff_p50, payoff_p95
  )
  select
    s.configuration_id, s.mode, s.profile_snapshot,
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

-- Dropping the column also drops its foreign key and the (profile_id, created_at) index.
-- This is DDL, so the append-only row triggers on simulations are not involved.
alter table public.simulations drop column profile_id;

drop table public.client_profiles;
drop function public.touch_updated_at();
drop type public.risk_appetite;
