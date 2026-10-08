import type { ClientProfile } from '../schemas/suitability.js';
import type { ProductType, SimulationMode, SuitabilityVerdict } from '../enums/domain.js';

/** The account a run belongs to. */
export interface RunOwner {
  id: string;
  email: string;
  displayName: string;
}

/**
 * One persisted simulation: what the admin audit view and a user's own saved-runs list show.
 * Linked to the account that ran it (`user`); null for a run made without signing in (development).
 */
export interface AuditSimulation {
  id: string;
  createdAt: string;
  user: RunOwner | null;
  mode: SimulationMode;
  productType: ProductType;
  /** ELN/CPN only. */
  underlyingSymbol: string | null;
  /** DCD only. */
  currencyPair: string | null;
  tenorDays: number;
  /** Notional (ELN/CPN) or deposit amount (DCD). */
  notional: number;
  /** The product terms as they were run. */
  terms: Record<string, unknown>;
  /** What the run started from: Mode B level and shock, or the Mode A training window. */
  inputs: {
    levelValue: number | null;
    levelSource: string | null;
    shockPct: number | null;
    shockedLevel: number | null;
    trainingWindowYears: number | null;
  };
  /** The client as the RM entered it; null if the simulation was recorded without one. */
  client: ClientProfile | null;
  results: Array<{
    scenario: string;
    payoff: number;
    returnPct: number;
    lossAmount: number;
    knockedIn: boolean | null;
  }>;
  verdict: SuitabilityVerdict | null;
  flags: Array<{ rule: string; hard: boolean; reason: string }>;
  explanationCount: number;
}

/**
 * Everything stored for one run: the evidence record of its suitability check (PRD §7.2).
 * Read-only; every number was computed by the backend when the run was made.
 */
export interface SavedRunDetail extends AuditSimulation {
  /** Mode B: when the starting level was observed; null for a manual level and for Mode A. */
  levelAsOf: string | null;
  /** Each stored case: the Mode A low/base/high paths, or the single Mode B shock. */
  cases: Array<{
    scenario: string;
    /** Mode A case percentile (5/50/95); null for Mode B. */
    percentile: number | null;
    /** The underlying (or FX) level at maturity. */
    terminal: number;
    /** Lowest level on a Mode A case path; null for Mode B. */
    pathMin: number | null;
    payoff: number;
    returnPct: number;
    lossAmount: number;
    knockedIn: boolean | null;
  }>;
  /** Mode A only: results across the simulated paths. */
  distribution: {
    pathCount: number;
    probabilityOfLoss: number;
    /** Null when the product has no barrier. */
    probabilityOfKnockIn: number | null;
    payoffQuantiles: { p5: number; p50: number; p95: number };
  } | null;
  /** Mode A only: the forecast metadata stored with the run (model, data, horizon, backtest). */
  forecast: Record<string, unknown> | null;
  /** The suitability rules version that produced the verdict; null without a verdict. */
  rulesVersion: string | null;
  /** When the verdict was recorded; null without a verdict. */
  assessedAt: string | null;
  /** Every explanation written for this run, oldest first. */
  explanations: Array<{
    createdAt: string;
    text: string;
    model: string;
    sources: string[] | null;
  }>;
}

/** `GET /api/runs/:id` (own run) and `GET /api/audit/simulations/:id` (admin, any run). */
export interface SavedRunResponse {
  run: SavedRunDetail;
}

/** `GET /api/audit/simulations` (admin: everyone's runs). Newest first. */
export interface AuditSimulationsResponse {
  simulations: AuditSimulation[];
}

/** `GET /api/runs`: the signed-in account's own saved runs. Newest first. */
export interface SavedRunsResponse {
  runs: AuditSimulation[];
}
