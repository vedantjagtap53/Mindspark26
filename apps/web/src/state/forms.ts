// Form state for the RM journey and the request bodies built from it. No financial maths here:
// the backend validates every field and computes every result.

export type ProductType = 'ELN' | 'DCD' | 'CPN';
export type RiskAppetite = 'low' | 'medium' | 'high';
export type Mode = 'A' | 'B';
export type LevelSourceChoice = 'manual' | 'live' | 'reference';

export interface ElnForm {
  symbol: string;
  assetClass: 'index' | 'equity';
  notional: number;
  tenorDays: number;
  strikePct: number;
  couponPct: number;
  barrierEnabled: boolean;
  barrierPct: number;
  barrierType: 'European' | 'American';
}

export interface DcdForm {
  depositCurrency: string;
  alternateCurrency: string;
  depositAmount: number;
  tenorDays: number;
  strikeRate: number;
  enhancedRatePct: number;
}

export interface CpnForm {
  symbol: string;
  assetClass: 'index' | 'equity';
  notional: number;
  tenorDays: number;
  protectionPct: number;
  participationPct: number;
  capEnabled: boolean;
  capPct: number;
}

/** Decided profile fields (DATABASE_SCHEMA.md). Saved profiles live behind /api/client-profiles. */
export interface ProfileForm {
  /** Id of the saved profile these fields were loaded from or saved as; null for an ad hoc profile. */
  profileId: string | null;
  clientRef: string;
  label: string;
  riskAppetite: RiskAppetite;
  horizonMonths: number;
  lossTolerancePct: number;
  concentrationPct: number;
}

export interface RunSettings {
  mode: Mode;
  shockPct: number;
  levelSource: LevelSourceChoice;
  /** RM-entered starting level (S_0, or FX spot for DCD); null until entered. */
  manualLevel: number | null;
  trainingWindowDays: number;
}

export interface Forms {
  ELN: ElnForm;
  DCD: DcdForm;
  CPN: CpnForm;
}

export const DEFAULT_FORMS: Forms = {
  ELN: {
    symbol: '^NSEI',
    assetClass: 'index',
    notional: 2_500_000,
    tenorDays: 182,
    strikePct: 100,
    couponPct: 9.5,
    barrierEnabled: true,
    barrierPct: 80,
    barrierType: 'European',
  },
  DCD: {
    depositCurrency: 'USD',
    alternateCurrency: 'INR',
    depositAmount: 50_000,
    tenorDays: 90,
    strikeRate: 84.5,
    enhancedRatePct: 8.25,
  },
  CPN: {
    symbol: '^NSEI',
    assetClass: 'index',
    notional: 2_500_000,
    tenorDays: 365,
    protectionPct: 100,
    participationPct: 80,
    capEnabled: false,
    capPct: 25,
  },
};

export const DEFAULT_PROFILE: ProfileForm = {
  profileId: null,
  clientRef: '',
  label: '',
  riskAppetite: 'medium',
  horizonMonths: 12,
  lossTolerancePct: 10,
  concentrationPct: 15,
};

/** The profile fields the suitability rules use (the reference and label are not sent to /suitability). */
export const clientProfile = (p: ProfileForm) => ({
  riskAppetite: p.riskAppetite,
  horizonMonths: p.horizonMonths,
  lossTolerancePct: p.lossTolerancePct,
  concentrationPct: p.concentrationPct,
});

export const DEFAULT_RUN: RunSettings = {
  mode: 'B',
  shockPct: -10,
  levelSource: 'manual',
  manualLevel: null,
  trainingWindowDays: 3650,
};

/** The `terms` object exactly as POST /api/configure and /api/simulate expect it. */
export function termsFor(product: ProductType, forms: Forms): Record<string, unknown> {
  if (product === 'ELN') {
    const f = forms.ELN;
    return {
      underlying: { symbol: f.symbol.trim(), assetClass: f.assetClass },
      notional: f.notional,
      tenorDays: f.tenorDays,
      strikePct: f.strikePct,
      couponPct: f.couponPct,
      ...(f.barrierEnabled ? { barrierPct: f.barrierPct, barrierType: f.barrierType } : {}),
    };
  }
  if (product === 'DCD') {
    const f = forms.DCD;
    return {
      depositCurrency: f.depositCurrency.trim(),
      alternateCurrency: f.alternateCurrency.trim(),
      depositAmount: f.depositAmount,
      tenorDays: f.tenorDays,
      strikeRate: f.strikeRate,
      enhancedRatePct: f.enhancedRatePct,
    };
  }
  const f = forms.CPN;
  return {
    underlying: { symbol: f.symbol.trim(), assetClass: f.assetClass },
    notional: f.notional,
    tenorDays: f.tenorDays,
    protectionPct: f.protectionPct,
    participationPct: f.participationPct,
    ...(f.capEnabled ? { capPct: f.capPct } : {}),
  };
}

export const configureRequest = (product: ProductType, forms: Forms) => ({
  productType: product,
  terms: termsFor(product, forms),
});

/** Why a run cannot be sent yet, or null when it can. The browser only checks for missing input. */
export function runBlocker(product: ProductType, run: RunSettings): string | null {
  const missingLevel = run.manualLevel === null || !(run.manualLevel > 0);
  if (run.mode === 'B' && run.levelSource === 'manual' && missingLevel) {
    return product === 'DCD'
      ? 'Enter the FX spot rate, or choose the reference rate.'
      : 'Enter the starting level, or choose the live level.';
  }
  return null;
}

/**
 * Run settings that are valid after switching from `from` to `to`: DCD uses the FX reference rate instead of a live level; ELN/CPN have no reference rate. A typed level is
 * cleared when switching between an index and an FX rate, so it is never sent for the wrong one.
 */
export function runSettingsFor(from: ProductType, to: ProductType, run: RunSettings): RunSettings {
  const manualLevel = (from === 'DCD') === (to === 'DCD') ? run.manualLevel : null;
  if (to === 'DCD') {
    return {
      ...run,
      manualLevel,
      levelSource: run.levelSource === 'live' ? 'reference' : run.levelSource,
    };
  }
  // Manual, not live: the live feed needs an Upstox token and may not be configured.
  return {
    ...run,
    manualLevel,
    levelSource: run.levelSource === 'reference' ? 'manual' : run.levelSource,
  };
}

export function simulateRequest(product: ProductType, forms: Forms, run: RunSettings) {
  const terms = termsFor(product, forms);
  if (run.mode === 'A') {
    return { mode: 'A', productType: product, terms, trainingWindowYears: run.trainingWindowDays / 365 };
  }
  const level =
    run.levelSource === 'manual'
      ? { source: 'manual', value: run.manualLevel }
      : { source: run.levelSource };
  return { mode: 'B', productType: product, terms, shockPct: run.shockPct, level };
}

/** The body of POST/PUT /api/client-profiles. */
export const savedProfileBody = (p: ProfileForm) => ({
  ...clientProfile(p),
  clientRef: p.clientRef.trim(),
  label: p.label.trim() || null,
});

export const profileFromSaved = (s: {
  id: string;
  clientRef: string;
  label: string | null;
  riskAppetite: RiskAppetite;
  horizonMonths: number;
  lossTolerancePct: number;
  concentrationPct: number;
}): ProfileForm => ({
  profileId: s.id,
  clientRef: s.clientRef,
  label: s.label ?? '',
  riskAppetite: s.riskAppetite,
  horizonMonths: s.horizonMonths,
  lossTolerancePct: s.lossTolerancePct,
  concentrationPct: s.concentrationPct,
});
