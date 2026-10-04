// Domain records for persistence (DATABASE_SCHEMA.md). These use the application's vocabulary
// ('live', 'Caution', 'low'); the database adapter maps them to its own enums and formats.
// Percent fields are percent numbers; probabilities are fractions. Timestamps are ISO strings.

import type {
  ClientProfile,
  ForecastCase,
  LevelSource,
  ProductType,
  SimulationMode,
  SuitabilityVerdict,
} from '@mindspark/shared';

/** Mode A cases, or the single Mode B shock. */
export type ScenarioCase = ForecastCase | 'shock';

export type JsonObject = Record<string, unknown>;

// ---- client profile (frozen with each simulation) ----

/**
 * The client as the RM entered it when the simulation ran: name, age and the four rule fields.
 * Stored with the simulation as evidence; there is no editable saved profile.
 */
export type ClientProfileSnapshot = ClientProfile;

// ---- product configurations (never edited) ----

export interface ProductConfigurationInput {
  productType: ProductType;
  /** ELN/CPN only. */
  underlyingSymbol: string | null;
  /** DCD only. */
  depositCurrency: string | null;
  alternateCurrency: string | null;
  tenorDays: number;
  /** Notional (ELN/CPN) or deposit amount (DCD). */
  notional: number;
  /** Normalized terms as returned by POST /api/configure. */
  terms: JsonObject;
}

export interface ProductConfigurationRecord extends ProductConfigurationInput {
  id: string;
  createdAt: string;
}

// ---- simulations (audit records; never edited or deleted) ----

export interface RiskResultInput {
  scenario: ScenarioCase;
  /** Mode A case percentile (5/50/95); null for Mode B. */
  percentile: number | null;
  terminal: number;
  /** Lowest level on a Mode A case path; null for Mode B. */
  pathMin: number | null;
  payoff: number;
  returnPct: number;
  lossAmount: number;
  /** Null when the product has no barrier. */
  knockedIn: boolean | null;
  details: JsonObject;
}

export interface RiskResultRecord extends RiskResultInput {
  createdAt: string;
}

interface SimulationInputBase {
  configurationId: string;
  /** The client as entered at simulation time; the audit record. */
  profileSnapshot: ClientProfileSnapshot | null;
  riskResults: RiskResultInput[];
}

export interface ModeBSimulationInput extends SimulationInputBase {
  mode: Extract<SimulationMode, 'B'>;
  levelValue: number;
  levelSource: LevelSource;
  /** ISO timestamp or date; null for a manual level. */
  levelAsOf: string | null;
  shockPct: number;
  shockedLevel: number;
}

export interface ModeASimulationInput extends SimulationInputBase {
  mode: Extract<SimulationMode, 'A'>;
  trainingWindowYears: number;
  /** Forecast record metadata (no sample paths or fan). */
  forecastMeta: JsonObject;
  pathCount: number;
  probabilityOfLoss: number;
  /** Null when the product has no barrier. */
  probabilityOfKnockIn: number | null;
  payoffQuantiles: { p5: number; p50: number; p95: number };
}

export type SimulationInput = ModeASimulationInput | ModeBSimulationInput;

export interface SuitabilityFlag {
  rule: string;
  /** Hard flags make the verdict Not suitable. */
  hard: boolean;
  reason: string;
}

export interface SuitabilityResultInput {
  simulationId: string;
  verdict: SuitabilityVerdict;
  flags: SuitabilityFlag[];
  rulesVersion: string;
}

export interface SuitabilityResultRecord extends Omit<SuitabilityResultInput, 'simulationId'> {
  id: string;
  createdAt: string;
}

export interface ExplanationInput {
  simulationId: string;
  text: string;
  model: string;
  sources: string[] | null;
}

export interface ExplanationRecord extends Omit<ExplanationInput, 'simulationId'> {
  id: string;
  createdAt: string;
}

interface SimulationRecordExtra {
  id: string;
  createdAt: string;
  configuration: ProductConfigurationRecord;
  riskResults: RiskResultRecord[];
  suitability: SuitabilityResultRecord | null;
  explanations: ExplanationRecord[];
}

type StoredFields<T> = Omit<T, 'riskResults' | 'configurationId'>;

/** The full audit record of one simulation (Omit is applied per mode to keep the union). */
export type SimulationRecord =
  | (StoredFields<ModeASimulationInput> & SimulationRecordExtra)
  | (StoredFields<ModeBSimulationInput> & SimulationRecordExtra);
