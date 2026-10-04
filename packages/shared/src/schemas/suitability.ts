// Client profile and the POST /api/suitability contract (PRD §7.2, docs/suitability-rules.md).
// Rules are deterministic and run on the backend; the browser only sends the profile.

import { z } from 'zod';
import type { SuitabilityVerdict } from '../enums/domain.js';

export const RISK_APPETITES = ['low', 'medium', 'high'] as const;
export type RiskAppetite = (typeof RISK_APPETITES)[number];

/** Decided 2026-10-04: loss tolerance is % of the amount invested, horizon is in months. */
export const clientProfileSchema = z.strictObject({
  riskAppetite: z.enum(RISK_APPETITES),
  horizonMonths: z.number().int().min(1).max(600),
  lossTolerancePct: z.number().min(0).max(100),
  /** Share of the client's portfolio in this product, percent. */
  concentrationPct: z.number().min(0).max(100),
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
}

// ---- saved client profiles (GET/POST /api/client-profiles, GET/PUT /api/client-profiles/:id) ----
// Approved 2026-10-03 (API_SPEC.md): supporting CRUD for reusing a profile in /suitability; not CRM
// (no login, ownership or roles). Fields from DATABASE_SCHEMA.md. No delete (decided 2026-10-04:
// profiles are only replaced, so audit snapshots never lose their source).

export const savedProfileInputSchema = clientProfileSchema.extend({
  /** The RM's own reference for the client (e.g. a CRM id). Never a name. Unique. */
  clientRef: z.string().trim().min(1).max(64),
  label: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type SavedProfileInput = z.output<typeof savedProfileInputSchema>;

export interface SavedProfile extends ClientProfile {
  id: string;
  clientRef: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

export const profileIdSchema = z.uuid();
