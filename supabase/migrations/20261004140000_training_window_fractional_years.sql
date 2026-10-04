-- The Mode A training window is now chosen in days (30 days to 3 years) and stored in years, so
-- it can be fractional (e.g. 0.5, 2.4). It was an integer when only 5 or 10 years were allowed.
-- Existing whole-year values convert unchanged. This is DDL, so the append-only row triggers on
-- simulations are not involved.
alter table public.simulations alter column training_window_years type double precision;
