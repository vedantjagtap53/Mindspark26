// Supabase implementation of the repository interfaces (tables from supabase/migrations).
// Must pass tests/contract/repositoryContract.ts.

import type { ProductType, SimulationMode } from '@mindspark/shared';
import {
  validateSimulationInput,
  type ClientProfileInput,
  type ClientProfileRecord,
  type ExplanationRecord,
  type JsonObject,
  type ProductConfigurationRecord,
  type Repositories,
  type RiskResultRecord,
  type SimulationRecord,
  type SuitabilityFlag,
} from '../interfaces/index.js';
import { fromDb, toDb, toIso } from './mapping.js';
import { unwrap, type Db } from './supabaseClient.js';

// ---- rows as returned by PostgREST ----

interface ProfileRow {
  id: string;
  client_ref: string;
  label: string | null;
  risk_appetite: string;
  horizon_months: number;
  loss_tolerance_pct: number;
  concentration_pct: number;
  created_at: string;
  updated_at: string;
}

interface ConfigurationRow {
  id: string;
  product_type: ProductType;
  underlying_symbol: string | null;
  deposit_currency: string | null;
  alternate_currency: string | null;
  tenor_days: number;
  notional: number;
  terms: JsonObject;
  created_at: string;
}

interface RiskRow {
  scenario: string;
  percentile: number | null;
  terminal: number;
  path_min: number | null;
  payoff: number;
  return_pct: number;
  loss_amount: number;
  knocked_in: boolean | null;
  details: JsonObject;
  created_at: string;
}

interface SuitabilityRow {
  id: string;
  verdict: string;
  flags: SuitabilityFlag[];
  rules_version: string;
  created_at: string;
}

interface ExplanationRow {
  id: string;
  text: string;
  model: string;
  sources: string[] | null;
  created_at: string;
}

type SnapshotRow = Omit<ClientProfileInput, 'riskAppetite'> & { riskAppetite: string };

/** PostgREST embeds a one-to-one relation as an object; older versions return a one-element list. */
type OneToOne<T> = T | T[] | null;

interface SimulationRow {
  id: string;
  profile_id: string | null;
  configuration: ConfigurationRow;
  mode: SimulationMode;
  profile_snapshot: SnapshotRow | null;
  level_value: number | null;
  level_source: string | null;
  level_as_of: string | null;
  shock_pct: number | null;
  shocked_level: number | null;
  training_window_years: number | null;
  forecast_meta: JsonObject | null;
  path_count: number | null;
  probability_of_loss: number | null;
  probability_of_knock_in: number | null;
  payoff_p5: number | null;
  payoff_p50: number | null;
  payoff_p95: number | null;
  created_at: string;
  risk_results: RiskRow[];
  suitability_results: OneToOne<SuitabilityRow>;
  explanations: ExplanationRow[];
}

interface SimulationSummaryRow {
  id: string;
  mode: SimulationMode;
  created_at: string;
  configuration: { product_type: ProductType; tenor_days: number; notional: number };
  suitability_results: OneToOne<{ verdict: string }>;
}

type Key = { id: string };

const PROFILE_COLUMNS =
  'id, client_ref, label, risk_appetite, horizon_months, loss_tolerance_pct, concentration_pct, created_at, updated_at';
const CONFIGURATION_COLUMNS =
  'id, product_type, underlying_symbol, deposit_currency, alternate_currency, tenor_days, notional, terms, created_at';
const SIMULATION_SELECT = `
  id, profile_id, mode, profile_snapshot,
  level_value, level_source, level_as_of, shock_pct, shocked_level,
  training_window_years, forecast_meta, path_count, probability_of_loss, probability_of_knock_in,
  payoff_p5, payoff_p50, payoff_p95, created_at,
  configuration:product_configurations!inner(${CONFIGURATION_COLUMNS}),
  risk_results(scenario, percentile, terminal, path_min, payoff, return_pct, loss_amount, knocked_in, details, created_at),
  suitability_results(id, verdict, flags, rules_version, created_at),
  explanations(id, text, model, sources, created_at)`;

// ---- mapping helpers ----

const one = <T>(v: OneToOne<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const profileRow = (p: ClientProfileInput) => ({
  client_ref: p.clientRef,
  label: p.label,
  risk_appetite: toDb.riskAppetite(p.riskAppetite),
  horizon_months: p.horizonMonths,
  loss_tolerance_pct: p.lossTolerancePct,
  concentration_pct: p.concentrationPct,
});

const toProfile = (r: ProfileRow): ClientProfileRecord => ({
  id: r.id,
  clientRef: r.client_ref,
  label: r.label,
  riskAppetite: fromDb.riskAppetite(r.risk_appetite),
  horizonMonths: r.horizon_months,
  lossTolerancePct: r.loss_tolerance_pct,
  concentrationPct: r.concentration_pct,
  createdAt: toIso(r.created_at),
  updatedAt: toIso(r.updated_at),
});

const toConfiguration = (r: ConfigurationRow): ProductConfigurationRecord => ({
  id: r.id,
  productType: r.product_type,
  underlyingSymbol: r.underlying_symbol,
  depositCurrency: r.deposit_currency,
  alternateCurrency: r.alternate_currency,
  tenorDays: r.tenor_days,
  notional: r.notional,
  terms: r.terms,
  createdAt: toIso(r.created_at),
});

const toRisk = (r: RiskRow): RiskResultRecord => ({
  scenario: fromDb.scenario(r.scenario),
  percentile: r.percentile,
  terminal: r.terminal,
  pathMin: r.path_min,
  payoff: r.payoff,
  returnPct: r.return_pct,
  lossAmount: r.loss_amount,
  knockedIn: r.knocked_in,
  details: r.details,
  createdAt: toIso(r.created_at),
});

/** Stored snapshots use the database enum; convert back to the application's vocabulary. */
const toSnapshot = (s: SnapshotRow | null): ClientProfileInput | null =>
  s ? { ...s, riskAppetite: fromDb.riskAppetite(s.riskAppetite) } : null;

function required<T>(value: T | null, field: string, id: string): T {
  if (value === null) throw new Error(`Simulation ${id} is missing ${field}`);
  return value;
}

function toSimulation(r: SimulationRow): SimulationRecord {
  const { id } = r;
  const verdict = one(r.suitability_results);
  const common = {
    id,
    createdAt: toIso(r.created_at),
    profileId: r.profile_id,
    profileSnapshot: toSnapshot(r.profile_snapshot),
    configuration: toConfiguration(r.configuration),
    riskResults: r.risk_results.map(toRisk),
    suitability: verdict
      ? {
          id: verdict.id,
          verdict: fromDb.verdict(verdict.verdict),
          flags: verdict.flags,
          rulesVersion: verdict.rules_version,
          createdAt: toIso(verdict.created_at),
        }
      : null,
    explanations: r.explanations.map(
      (e): ExplanationRecord => ({
        id: e.id,
        text: e.text,
        model: e.model,
        sources: e.sources,
        createdAt: toIso(e.created_at),
      }),
    ),
  };
  if (r.mode === 'A') {
    return {
      ...common,
      mode: 'A',
      trainingWindowYears: required(r.training_window_years, 'training_window_years', id),
      forecastMeta: required(r.forecast_meta, 'forecast_meta', id),
      pathCount: required(r.path_count, 'path_count', id),
      probabilityOfLoss: required(r.probability_of_loss, 'probability_of_loss', id),
      probabilityOfKnockIn: r.probability_of_knock_in,
      payoffQuantiles: {
        p5: required(r.payoff_p5, 'payoff_p5', id),
        p50: required(r.payoff_p50, 'payoff_p50', id),
        p95: required(r.payoff_p95, 'payoff_p95', id),
      },
    };
  }
  return {
    ...common,
    mode: 'B',
    levelValue: required(r.level_value, 'level_value', id),
    levelSource: fromDb.levelSource(required(r.level_source, 'level_source', id)),
    levelAsOf: r.level_as_of,
    shockPct: required(r.shock_pct, 'shock_pct', id),
    shockedLevel: required(r.shocked_level, 'shocked_level', id),
  };
}

// ---- repositories ----

export function createSupabaseRepositories(db: Db): Repositories {
  return {
    clientProfiles: {
      async create(input) {
        const row = unwrap<Key>(
          await db.from('client_profiles').insert(profileRow(input)).select('id').single(),
        );
        return row.id;
      },
      async update(id, input) {
        const rows = unwrap<Key[]>(
          await db.from('client_profiles').update(profileRow(input)).eq('id', id).select('id'),
        );
        return rows.length > 0;
      },
      async getById(id) {
        const row = unwrap<ProfileRow | null>(
          await db.from('client_profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle(),
        );
        return row ? toProfile(row) : null;
      },
      async getByRef(clientRef) {
        const row = unwrap<ProfileRow | null>(
          await db
            .from('client_profiles')
            .select(PROFILE_COLUMNS)
            .eq('client_ref', clientRef)
            .maybeSingle(),
        );
        return row ? toProfile(row) : null;
      },
      async list({ limit, offset }) {
        const rows = unwrap<ProfileRow[]>(
          await db
            .from('client_profiles')
            .select(PROFILE_COLUMNS)
            .order('updated_at', { ascending: false })
            .range(offset, offset + limit - 1),
        );
        return rows.map(toProfile);
      },
    },

    productConfigurations: {
      async create(input) {
        const row = unwrap<Key>(
          await db
            .from('product_configurations')
            .insert({
              product_type: input.productType,
              underlying_symbol: input.underlyingSymbol,
              deposit_currency: input.depositCurrency,
              alternate_currency: input.alternateCurrency,
              tenor_days: input.tenorDays,
              notional: input.notional,
              terms: input.terms,
            })
            .select('id')
            .single(),
        );
        return row.id;
      },
      async getById(id) {
        const row = unwrap<ConfigurationRow | null>(
          await db
            .from('product_configurations')
            .select(CONFIGURATION_COLUMNS)
            .eq('id', id)
            .maybeSingle(),
        );
        return row ? toConfiguration(row) : null;
      },
    },

    simulations: {
      async record(input) {
        validateSimulationInput(input);
        const common = {
          configuration_id: input.configurationId,
          profile_id: input.profileId,
          mode: input.mode,
          profile_snapshot: input.profileSnapshot && {
            ...input.profileSnapshot,
            riskAppetite: toDb.riskAppetite(input.profileSnapshot.riskAppetite),
          },
        };
        const simulation =
          input.mode === 'A'
            ? {
                ...common,
                training_window_years: input.trainingWindowYears,
                forecast_meta: input.forecastMeta,
                path_count: input.pathCount,
                probability_of_loss: input.probabilityOfLoss,
                probability_of_knock_in: input.probabilityOfKnockIn,
                payoff_p5: input.payoffQuantiles.p5,
                payoff_p50: input.payoffQuantiles.p50,
                payoff_p95: input.payoffQuantiles.p95,
              }
            : {
                ...common,
                level_value: input.levelValue,
                level_source: toDb.levelSource(input.levelSource),
                level_as_of: input.levelAsOf,
                shock_pct: input.shockPct,
                shocked_level: input.shockedLevel,
              };
        const riskResults = input.riskResults.map((x) => ({
          scenario: toDb.scenario(x.scenario),
          percentile: x.percentile,
          terminal: x.terminal,
          path_min: x.pathMin,
          payoff: x.payoff,
          return_pct: x.returnPct,
          loss_amount: x.lossAmount,
          knocked_in: x.knockedIn,
          details: x.details,
        }));
        return unwrap<string>(
          await db.rpc('record_simulation', { simulation, risk_results: riskResults }),
        );
      },
      async getById(id) {
        const row = unwrap<SimulationRow | null>(
          await db
            .from('simulations')
            .select(SIMULATION_SELECT)
            .eq('id', id)
            .order('scenario', { referencedTable: 'risk_results' })
            .order('created_at', { referencedTable: 'explanations' })
            .maybeSingle(),
        );
        return row ? toSimulation(row) : null;
      },
      async listForProfile(profileId, limit) {
        const rows = unwrap<SimulationSummaryRow[]>(
          await db
            .from('simulations')
            .select(
              'id, mode, created_at, configuration:product_configurations!inner(product_type, tenor_days, notional), suitability_results(verdict)',
            )
            .eq('profile_id', profileId)
            .order('created_at', { ascending: false })
            .limit(limit),
        );
        return rows.map((s) => {
          const verdict = one(s.suitability_results);
          return {
            id: s.id,
            mode: s.mode,
            createdAt: toIso(s.created_at),
            productType: s.configuration.product_type,
            tenorDays: s.configuration.tenor_days,
            notional: s.configuration.notional,
            verdict: verdict ? fromDb.verdict(verdict.verdict) : null,
          };
        });
      },
    },

    suitabilityResults: {
      async create({ simulationId, verdict, flags, rulesVersion }) {
        const row = unwrap<Key>(
          await db
            .from('suitability_results')
            .insert({
              simulation_id: simulationId,
              verdict: toDb.verdict(verdict),
              flags,
              rules_version: rulesVersion,
            })
            .select('id')
            .single(),
        );
        return row.id;
      },
    },

    explanations: {
      async create({ simulationId, text, model, sources }) {
        const row = unwrap<Key>(
          await db
            .from('explanations')
            .insert({ simulation_id: simulationId, text, model, sources })
            .select('id')
            .single(),
        );
        return row.id;
      },
    },
  };
}
