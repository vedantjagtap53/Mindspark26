// Client profile and the POST /api/suitability contract (PRD §7.2, docs/suitability-rules.md).
// Rules are deterministic and run on the backend; the browser only sends the profile.

import { z } from 'zod';
import type { SuitabilityVerdict } from '../enums/domain.js';

export const RISK_APPETITES = ['low', 'medium', 'high'] as const;
export type RiskAppetite = (typeof RISK_APPETITES)[number];

/**
 * The four fields the suitability rules read. Decided 2026-10-04: loss tolerance is % of the
 * amount invested, horizon is in months.
 */
export const suitabilityProfileSchema = z.strictObject({
  riskAppetite: z.enum(RISK_APPETITES),
  horizonMonths: z.number().int().min(1).max(600),
  lossTolerancePct: z.number().min(0).max(100),
  /** Share of the client's portfolio in this product, percent. */
  concentrationPct: z.number().min(0).max(100),
});
export type SuitabilityProfile = z.output<typeof suitabilityProfileSchema>;

/**
 * The client as the RM enters it (decided 2026-10-04: no saved profiles). Name and age are
 * display-only: they appear on screen and in the memo and are stored with the audit record, but
 * no suitability rule reads them and they are never sent to the AI service.
 */
export const clientProfileSchema = suitabilityProfileSchema.extend({
  name: z.string().trim().min(1).max(120),
  age: z.number().int().min(18).max(120),
});
export type ClientProfile = z.output<typeof clientProfileSchema>;

/** Id returned by POST /api/simulate. */
export const simulationIdSchema = z.string().trim().min(1).max(100);

export const suitabilityRequestSchema = z.strictObject({
  simulationId: simulationIdSchema,
  profile: clientProfileSchema,
});
export type SuitabilityRequest = z.output<typeof suitabilityRequestSchema>;

export const SUITABILITY_RULES = [
  'low_case_loss',
  'barrier_knock_in',
  'tenor_vs_horizon',
  'concentration',
  'risk_vs_appetite',
] as const;
export type SuitabilityRule = (typeof SUITABILITY_RULES)[number];

export interface SuitabilityFlag {
  rule: SuitabilityRule;
  /** `not_suitable` is a hard flag. */
  severity: 'caution' | 'not_suitable';
  message: string;
}

export interface SuitabilityResponse {
  simulationId: string;
  verdict: SuitabilityVerdict;
  flags: SuitabilityFlag[];
  /** The outcome the loss and knock-in checks used: P5 path (Mode A) or worst shock (Mode B). */
  lowCase: { label: string; returnPct: number; knockedIn: boolean | null };
  /** Fixed product risk rating used by the risk-appetite check. */
  productRiskRating: 'Low' | 'High';
  /**
   * Whether the simulation, verdict and profile snapshot were written to the database. `false`
   * only when Supabase is not configured (development and tests); a configured
   * database that fails returns DATABASE_ERROR instead.
   */
  persisted: boolean;
}
