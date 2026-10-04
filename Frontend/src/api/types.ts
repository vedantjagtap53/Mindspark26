/**
 * @license
 * Payoff Desk — Structured Products Suitability Simulator
 * Core Data Contracts and Type Definitions
 */

export type ProductType = 'ELN' | 'DCD' | 'CPN';
export type BarrierType = 'European' | 'American';
export type RiskAppetite = 'Conservative' | 'Moderate' | 'Aggressive';
export type SimMode = 'FORECAST' | 'SHOCK';
export type Verdict = 'SUITABLE' | 'CAUTION' | 'NOT_SUITABLE';

export interface ELNInputs {
  underlying: string;
  currency: string;
  notional: number;
  tenorDays: number;
  strikePct: number; // e.g. 100
  barrierPct: number; // e.g. 85
  couponPctPa: number; // e.g. 9.5
  barrierType: BarrierType;
}

export interface DCDInputs {
  currencyPair: string; // e.g. "USD/INR"
  depositCurrency: string;
  alternateCurrency: string;
  depositAmount: number;
  tenorDays: number;
  strikeRate: number; // e.g. 84.00
  enhancedRatePctPa: number; // e.g. 8.25
}

export interface CPNInputs {
  underlying: string;
  currency: string;
  notional: number;
  tenorDays: number;
  protectionPct: number; // e.g. 100 or 95
  participationPct: number; // e.g. 75
  capPct: number | null; // e.g. 125 or null for uncapped
}

export type ProductInputs = ELNInputs | DCDInputs | CPNInputs;

export interface ClientProfile {
  id?: string;
  name: string;
  age?: number | '';
  riskAppetite: RiskAppetite;
  investmentHorizonMonths: number;
  lossTolerancePct: number; // % of notional client can tolerate losing
  concentrationPct: number; // % of portfolio in this product
  portfolioValue: number;
}

export interface ScenarioResult {
  scenarioLabel: string;
  underlyingPctChange: number;
  underlyingLevel: number;
  payoffAmount: number;
  returnPct: number;
  knockedIn?: boolean;
  notes?: string;
}

export interface DistributionStats {
  probLoss: number; // 0 to 1
  probKnockIn?: number; // 0 to 1 (ELN only)
  payoffP5: number;
  payoffP50: number;
  payoffP95: number;
  returnP5: number;
  returnP50: number;
  returnP95: number;
}

export interface FanPoint {
  date: string;
  isHistorical: boolean;
  isHolidayGap?: boolean;
  actual?: number;
  p5?: number;
  p50?: number;
  p95?: number;
  lowPath?: number;
  basePath?: number;
  highPath?: number;
}

export interface PayoffCurvePoint {
  underlyingPct: number; // -30 to +30
  underlyingPrice: number;
  payoffAmount: number;
  returnPct: number;
  knockedIn?: boolean;
}

export interface BacktestMetric {
  horizonMonths: number;
  coverageP5P95: number; // e.g. 91.4
  targetCoverage: number; // 90.0
  baseMape: number; // e.g. 3.4%
  naiveMape: number; // e.g. 5.1%
}

export interface ModelCard {
  model: string;
  trainingWindow: string;
  drift: string;
  asOfDate: string;
  pathsCount: number;
  backtest: BacktestMetric[];
}

export interface SuitabilityFlag {
  rule: string;
  reason: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
}

export interface SimulationResult {
  id: string;
  mode: SimMode;
  asOf: string;
  isStale: boolean;
  product: ProductType;
  underlyingName: string;
  spotPrice: number;
  inputs: ProductInputs;
  profile: ClientProfile;
  headlineRange: string;
  cases: {
    low: ScenarioResult;
    base: ScenarioResult;
    high: ScenarioResult;
  };
  scenarios: ScenarioResult[];
  payoffCurve: PayoffCurvePoint[];
  distribution?: DistributionStats;
  fan?: FanPoint[];
  modelCard?: ModelCard;
  suitability: {
    verdict: Verdict;
    flags: SuitabilityFlag[];
  };
  explanation: {
    summary: string;
    bestCase: string;
    worstCase: string;
    lossTrigger: string;
    suitabilityRationale: string;
  };
  notes?: string;
}

export interface SavedSimulationRecord {
  id: string;
  savedAt: string;
  clientName: string;
  product: ProductType;
  underlying: string;
  notionalFormatted: string;
  tenorDays: number;
  verdict: Verdict;
  mode: SimMode;
  result: SimulationResult;
}

export interface ChatMessage {
  id: string;
  sender: 'RM' | 'DESK';
  timestamp: string;
  text: string;
}
