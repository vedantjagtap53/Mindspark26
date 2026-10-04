// Static copy for the three products (PRD §3). Descriptions only: no payoff numbers live here.
import type { ProductType } from '../state/forms';

export interface ProductInfo {
  code: ProductType;
  name: string;
  tagline: string;
  /** Plain-language outcomes at maturity, without amounts (the backend computes those). */
  outcomes: Array<{ title: string; text: string; tone: 'good' | 'bad' | 'neutral' }>;
  /** Product risk rating (decided 2026-10-03, IMPLEMENTATION_STATUS.md). */
  riskRating: 'Low' | 'High';
}

export const PRODUCTS: Record<ProductType, ProductInfo> = {
  ELN: {
    code: 'ELN',
    name: 'Equity Linked Note',
    tagline: 'Enhanced coupon in exchange for exposure to a fall in the underlying.',
    riskRating: 'High',
    outcomes: [
      {
        title: 'Underlying at or above the strike (or barrier not knocked in)',
        text: 'The client receives the notional back plus the coupon for the tenor.',
        tone: 'good',
      },
      {
        title: 'Knocked in and below the strike',
        text: 'Principal falls with the underlying relative to the strike; the coupon is still paid.',
        tone: 'bad',
      },
    ],
  },
  DCD: {
    code: 'DCD',
    name: 'Dual Currency Deposit',
    tagline: 'Enhanced deposit rate in exchange for possible conversion at the strike rate.',
    riskRating: 'High',
    outcomes: [
      {
        title: 'FX rate on the right side of the strike',
        text: 'The deposit is repaid in the deposit currency with the enhanced interest.',
        tone: 'good',
      },
      {
        title: 'FX rate past the strike',
        text: 'Principal and interest are converted into the alternate currency at the strike rate.',
        tone: 'bad',
      },
    ],
  },
  CPN: {
    code: 'CPN',
    name: 'Capital Protected Note',
    tagline: 'A protected floor on the notional plus a share of the underlying’s rise.',
    riskRating: 'Low',
    outcomes: [
      {
        title: 'Underlying rises',
        text: 'The client receives the protected amount plus the participation in the gain, up to any cap.',
        tone: 'good',
      },
      {
        title: 'Underlying falls',
        text: 'The client receives the protected percentage of the notional.',
        tone: 'neutral',
      },
    ],
  },
};

/** Quick picks only; any tenor from 30 to 1,095 days can be typed. */
export const TENOR_PRESETS: Record<ProductType, number[]> = {
  ELN: [90, 182, 365],
  DCD: [30, 90, 182],
  CPN: [365, 730, 1095],
};

/** PRD §7.2 Mode B shocks: −10%, 0%, +x% or a custom value. */
export const SHOCK_PRESETS = [-25, -10, 0, 15];
