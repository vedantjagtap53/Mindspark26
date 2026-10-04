// Product term schemas for ELN, DCD and CPN (PRD.md §3). Used by `/api/configure` and,
// later, `/api/simulate`. Percent fields are percent numbers: 95 means 95%, not 0.95.
// Strike and barrier percentages are relative to the starting level S_0
// (docs/product-formulas.md). Only PRD rules plus basic sanity checks are enforced.

import { z } from 'zod';
import {
  CALENDAR_DAYS_PER_YEAR,
  TENOR_DAYS_MAX,
  TENOR_DAYS_MIN,
  UNDERLYING_ASSET_CLASSES,
} from '../constants/forecast.js';
import { ELN_BARRIER_TYPES } from '../enums/domain.js';

const positive = z.number().positive();
const nonNegative = z.number().min(0);

const underlying = z.strictObject({
  symbol: z.string().trim().min(1),
  assetClass: z.enum(UNDERLYING_ASSET_CLASSES),
});

const currency = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, 'expected a 3-letter currency code'));

const tenorDays = z.number().int().min(TENOR_DAYS_MIN).max(TENOR_DAYS_MAX);

export const elnTermsSchema = z
  .strictObject({
    underlying,
    notional: positive,
    tenorDays,
    strikePct: positive,
    couponPct: nonNegative,
    // Plain ELN: omit both barrier fields. Barrier ELN: provide both.
    barrierPct: positive.optional(),
    barrierType: z.enum(ELN_BARRIER_TYPES).optional(),
  })
  .superRefine((t, ctx) => {
    const hasPct = t.barrierPct !== undefined;
    const hasType = t.barrierType !== undefined;
    if (hasPct !== hasType) {
      ctx.addIssue({
        code: 'custom',
        path: [hasPct ? 'barrierType' : 'barrierPct'],
        message: 'barrierPct and barrierType must be provided together (omit both for a plain ELN)',
      });
    }
    if (t.barrierPct !== undefined && t.barrierPct >= t.strikePct) {
      ctx.addIssue({
        code: 'custom',
        path: ['barrierPct'],
        message: 'barrierPct must be below strikePct',
      });
    }
  });

export const dcdTermsSchema = z
  .strictObject({
    depositCurrency: currency,
    alternateCurrency: currency,
    depositAmount: positive,
    tenorDays,
    /** Quoted as units of the alternate currency per 1 unit of the deposit currency. */
    strikeRate: positive,
    enhancedRatePct: nonNegative,
  })
  .superRefine((t, ctx) => {
    if (t.depositCurrency === t.alternateCurrency) {
      ctx.addIssue({
        code: 'custom',
        path: ['alternateCurrency'],
        message: 'alternateCurrency must differ from depositCurrency',
      });
    }
  });

export const cpnTermsSchema = z.strictObject({
  underlying,
  notional: positive,
  tenorDays,
  protectionPct: z.number().min(0).max(100),
  participationPct: positive,
  capPct: positive.optional(),
});

export const configureRequestSchema = z.discriminatedUnion('productType', [
  z.strictObject({ productType: z.literal('ELN'), terms: elnTermsSchema }),
  z.strictObject({ productType: z.literal('DCD'), terms: dcdTermsSchema }),
  z.strictObject({ productType: z.literal('CPN'), terms: cpnTermsSchema }),
]);

export type ElnTerms = z.output<typeof elnTermsSchema>;
export type DcdTerms = z.output<typeof dcdTermsSchema>;
export type CpnTerms = z.output<typeof cpnTermsSchema>;
export type ConfigureRequest = z.output<typeof configureRequestSchema>;

/** Coupon year fraction `T = tenorDays / 365` (docs/product-formulas.md). */
export function tenorYears(tenor: number): number {
  return tenor / CALENDAR_DAYS_PER_YEAR;
}

export type ElnVariant = 'plain' | 'barrier';

/** Validated terms plus values derived from them. Returned by `/api/configure`. */
export type ConfigureResponse =
  | { productType: 'ELN'; terms: ElnTerms; derived: { variant: ElnVariant; tenorYears: number } }
  | { productType: 'DCD'; terms: DcdTerms; derived: { tenorYears: number } }
  | { productType: 'CPN'; terms: CpnTerms; derived: { tenorYears: number } };
