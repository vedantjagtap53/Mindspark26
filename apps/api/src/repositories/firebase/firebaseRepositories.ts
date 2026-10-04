// Firebase SQL Connect implementation of the repository interfaces. Uses only the named
// operations in dataconnect/connector; must pass tests/contract/repositoryContract.ts.

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
import type { OperationRunner } from './dataConnectRunner.js';
import { fromDb, toDb, toIso, toUuid } from './mapping.js';

// ---- rows as returned by the connector queries ----

interface ProfileRow {
  id: string;
  clientRef: string;
  label: string | null;
  riskAppetite: string;
  horizonMonths: number;
  lossTolerancePct: number;
  concentrationPct: number;
  createdAt: string;
  updatedAt: string;
}

interface ConfigurationRow {
  id: string;
  productType: ProductType;
  underlyingSymbol: string | null;
  depositCurrency: string | null;
  alternateCurrency: string | null;
  tenorDays: number;
  notional: number;
  terms: JsonObject;
  createdAt: string;
}

interface RiskRow {
  scenario: string;
  percentile: number | null;
  terminal: number;
  pathMin: number | null;
  payoff: number;
  returnPct: number;
  lossAmount: number;
  knockedIn: boolean | null;
  details: JsonObject;
  createdAt: string;
}

type SnapshotRow = Omit<ClientProfileInput, 'riskAppetite'> & { riskAppetite: string };

interface SimulationRow {
  id: string;
  profile: { id: string } | null;
  configuration: ConfigurationRow;
  mode: SimulationMode;
  profileSnapshot: SnapshotRow | null;
  levelValue: number | null;
  levelSource: string | null;
  levelAsOf: string | null;
  shockPct: number | null;
  shockedLevel: number | null;
  trainingWindowYears: number | null;
  forecastMeta: JsonObject | null;
  pathCount: number | null;
  probabilityOfLoss: number | null;
  probabilityOfKnockIn: number | null;
  payoffP5: number | null;
  payoffP50: number | null;
  payoffP95: number | null;
  createdAt: string;
  riskResults_on_simulation: RiskRow[];
  suitabilityResult_on_simulation: {
    id: string;
    verdict: string;
    flags: SuitabilityFlag[];
    rulesVersion: string;
    createdAt: string;
  } | null;
  explanations_on_simulation: Array<{
    id: string;
    text: string;
    model: string;
    sources: string[] | null;
    createdAt: string;
  }>;
}

interface SimulationSummaryRow {
  id: string;
  mode: SimulationMode;
  createdAt: string;
  configuration: { id: string; productType: ProductType; tenorDays: number; notional: number };
  suitabilityResult_on_simulation: { verdict: string } | null;
}

type Key = { id: string };

// ---- mapping helpers ----

const profileVars = (p: ClientProfileInput) => ({
  clientRef: p.clientRef,
  label: p.label,
  riskAppetite: toDb.riskAppetite(p.riskAppetite),
  horizonMonths: p.horizonMonths,
  lossTolerancePct: p.lossTolerancePct,
  concentrationPct: p.concentrationPct,
});

const toProfile = (r: ProfileRow): ClientProfileRecord => ({
  id: toUuid(r.id),
  clientRef: r.clientRef,
  label: r.label,
  riskAppetite: fromDb.riskAppetite(r.riskAppetite),
  horizonMonths: r.horizonMonths,
  lossTolerancePct: r.lossTolerancePct,
  concentrationPct: r.concentrationPct,
  createdAt: toIso(r.createdAt),
  updatedAt: toIso(r.updatedAt),
});

const toConfiguration = (r: ConfigurationRow): ProductConfigurationRecord => ({
  ...r,
  id: toUuid(r.id),
  createdAt: toIso(r.createdAt),
});

const toRisk = (r: RiskRow): RiskResultRecord => ({
  ...r,
  scenario: fromDb.scenario(r.scenario),
  createdAt: toIso(r.createdAt),
});

/** Stored snapshots use the database enum; convert back to the application's vocabulary. */
const toSnapshot = (s: SnapshotRow | null): ClientProfileInput | null =>
  s ? { ...s, riskAppetite: fromDb.riskAppetite(s.riskAppetite) } : null;

function required<T>(value: T | null, field: string, id: string): T {
  if (value === null) throw new Error(`Simulation ${id} is missing ${field}`);
  return value;
}

function toSimulation(r: SimulationRow): SimulationRecord {
  const id = toUuid(r.id);
  const verdict = r.suitabilityResult_on_simulation;
  const common = {
    id,
    createdAt: toIso(r.createdAt),
    profileId: r.profile ? toUuid(r.profile.id) : null,
    profileSnapshot: toSnapshot(r.profileSnapshot),
    configuration: toConfiguration(r.configuration),
    riskResults: r.riskResults_on_simulation.map(toRisk),
    suitability: verdict
      ? {
          id: toUuid(verdict.id),
          verdict: fromDb.verdict(verdict.verdict),
          flags: verdict.flags,
          rulesVersion: verdict.rulesVersion,
          createdAt: toIso(verdict.createdAt),
        }
      : null,
    explanations: r.explanations_on_simulation.map((e): ExplanationRecord => ({
      ...e,
      id: toUuid(e.id),
      createdAt: toIso(e.createdAt),
    })),
  };
  if (r.mode === 'A') {
    return {
      ...common,
      mode: 'A',
      trainingWindowYears: required(r.trainingWindowYears, 'trainingWindowYears', id),
      forecastMeta: required(r.forecastMeta, 'forecastMeta', id),
      pathCount: required(r.pathCount, 'pathCount', id),
      probabilityOfLoss: required(r.probabilityOfLoss, 'probabilityOfLoss', id),
      probabilityOfKnockIn: r.probabilityOfKnockIn,
      payoffQuantiles: {
        p5: required(r.payoffP5, 'payoffP5', id),
        p50: required(r.payoffP50, 'payoffP50', id),
        p95: required(r.payoffP95, 'payoffP95', id),
      },
    };
  }
  return {
    ...common,
    mode: 'B',
    levelValue: required(r.levelValue, 'levelValue', id),
    levelSource: fromDb.levelSource(required(r.levelSource, 'levelSource', id)),
    levelAsOf: r.levelAsOf,
    shockPct: required(r.shockPct, 'shockPct', id),
    shockedLevel: required(r.shockedLevel, 'shockedLevel', id),
  };
}

// ---- repositories ----

export function createFirebaseRepositories(run: OperationRunner): Repositories {
  return {
    clientProfiles: {
      async create(input) {
        const r = await run.mutation<{ clientProfile_insert: Key }>(
          'CreateClientProfile',
          profileVars(input),
        );
        return toUuid(r.clientProfile_insert.id);
      },
      async update(id, input) {
        const r = await run.mutation<{ clientProfile_update: Key | null }>('UpdateClientProfile', {
          id,
          ...profileVars(input),
        });
        return r.clientProfile_update !== null;
      },
      async getById(id) {
        const r = await run.query<{ clientProfile: ProfileRow | null }>('GetClientProfile', { id });
        return r.clientProfile ? toProfile(r.clientProfile) : null;
      },
      async getByRef(clientRef) {
        const r = await run.query<{ clientProfiles: ProfileRow[] }>('GetClientProfileByRef', {
          clientRef,
        });
        const row = r.clientProfiles[0];
        return row ? toProfile(row) : null;
      },
      async list({ limit, offset }) {
        const r = await run.query<{ clientProfiles: ProfileRow[] }>('ListClientProfiles', {
          limit,
          offset,
        });
        return r.clientProfiles.map(toProfile);
      },
    },

    productConfigurations: {
      async create(input) {
        const r = await run.mutation<{ productConfiguration_insert: Key }>(
          'CreateProductConfiguration',
          { ...input },
        );
        return toUuid(r.productConfiguration_insert.id);
      },
      async getById(id) {
        const r = await run.query<{ productConfiguration: ConfigurationRow | null }>(
          'GetProductConfiguration',
          { id },
        );
        return r.productConfiguration ? toConfiguration(r.productConfiguration) : null;
      },
    },

    simulations: {
      async record(input) {
        validateSimulationInput(input);
        const common = {
          configurationId: input.configurationId,
          profileId: input.profileId,
          mode: input.mode,
          profileSnapshot: input.profileSnapshot && {
            ...input.profileSnapshot,
            riskAppetite: toDb.riskAppetite(input.profileSnapshot.riskAppetite),
          },
          riskResults: input.riskResults.map((x) => ({
            ...x,
            scenario: toDb.scenario(x.scenario),
          })),
        };
        const vars =
          input.mode === 'A'
            ? {
                ...common,
                trainingWindowYears: input.trainingWindowYears,
                forecastMeta: input.forecastMeta,
                pathCount: input.pathCount,
                probabilityOfLoss: input.probabilityOfLoss,
                probabilityOfKnockIn: input.probabilityOfKnockIn,
                payoffP5: input.payoffQuantiles.p5,
                payoffP50: input.payoffQuantiles.p50,
                payoffP95: input.payoffQuantiles.p95,
              }
            : {
                ...common,
                levelValue: input.levelValue,
                levelSource: toDb.levelSource(input.levelSource),
                levelAsOf: input.levelAsOf,
                shockPct: input.shockPct,
                shockedLevel: input.shockedLevel,
              };
        const r = await run.mutation<{ simulation_insert: Key }>('RecordSimulation', vars);
        return toUuid(r.simulation_insert.id);
      },
      async getById(id) {
        const r = await run.query<{ simulation: SimulationRow | null }>('GetSimulation', { id });
        return r.simulation ? toSimulation(r.simulation) : null;
      },
      async listForProfile(profileId, limit) {
        const r = await run.query<{ simulations: SimulationSummaryRow[] }>(
          'ListSimulationsForProfile',
          { profileId, limit },
        );
        return r.simulations.map((s) => ({
          id: toUuid(s.id),
          mode: s.mode,
          createdAt: toIso(s.createdAt),
          productType: s.configuration.productType,
          tenorDays: s.configuration.tenorDays,
          notional: s.configuration.notional,
          verdict: s.suitabilityResult_on_simulation
            ? fromDb.verdict(s.suitabilityResult_on_simulation.verdict)
            : null,
        }));
      },
    },

    suitabilityResults: {
      async create({ simulationId, verdict, flags, rulesVersion }) {
        const r = await run.mutation<{ suitabilityResult_insert: Key }>('CreateSuitabilityResult', {
          simulationId,
          verdict: toDb.verdict(verdict),
          flags,
          rulesVersion,
        });
        return toUuid(r.suitabilityResult_insert.id);
      },
    },

    explanations: {
      async create(input) {
        const r = await run.mutation<{ explanation_insert: Key }>('CreateExplanation', {
          ...input,
        });
        return toUuid(r.explanation_insert.id);
      },
    },
  };
}
