import { describe, expect, it } from 'vitest';
import type { SuitabilityProfile } from '@mindspark/shared';
import {
  assessSuitability,
  type SuitabilityInput,
} from '../../../src/engines/suitability/suitability.js';

const calm: SuitabilityProfile = {
  riskAppetite: 'high',
  horizonMonths: 24,
  lossTolerancePct: 20,
  concentrationPct: 10,
};

const input = (over: Partial<SuitabilityInput> = {}): SuitabilityInput => ({
  productType: 'ELN',
  tenorDays: 182,
  lowCase: { label: 'low (P5)', returnPct: -5, knockedIn: false },
  baseCase: { label: 'base (P50)', returnPct: 4, knockedIn: false },
  profile: calm,
  concentrationLimitPct: 25,
  ...over,
});

const rules = (i: SuitabilityInput) => assessSuitability(i).flags.map((f) => f.rule);

describe('suitability rules', () => {
  it('is Suitable with no flags', () => {
    expect(assessSuitability(input())).toEqual({ verdict: 'Suitable', flags: [] });
  });

  it('low-case loss above tolerance is a hard flag', () => {
    const r = assessSuitability(
      input({ lowCase: { label: 'low (P5)', returnPct: -22, knockedIn: false } }),
    );
    expect(r.verdict).toBe('Not suitable');
    expect(r.flags[0]).toMatchObject({ rule: 'low_case_loss', severity: 'not_suitable' });
    expect(r.flags[0]!.message).toContain('22%');
  });

  it('a loss equal to the tolerance is not flagged', () => {
    expect(rules(input({ lowCase: { label: 'low', returnPct: -20, knockedIn: false } }))).toEqual(
      [],
    );
  });

  it('ELN knock-in in the low or base case is Caution; other products ignore it', () => {
    const knocked = { label: 'low', returnPct: -1, knockedIn: true };
    expect(assessSuitability(input({ lowCase: knocked })).verdict).toBe('Caution');
    expect(rules(input({ lowCase: knocked }))).toEqual(['barrier_knock_in']);
    expect(rules(input({ productType: 'CPN', lowCase: knocked }))).toEqual([]);
  });

  it('tenor longer than the horizon is Caution (months × 365/12 days)', () => {
    const profile = { ...calm, horizonMonths: 6 }; // ≈ 182.5 days
    expect(rules(input({ profile, tenorDays: 182 }))).toEqual([]);
    expect(rules(input({ profile, tenorDays: 183 }))).toEqual(['tenor_vs_horizon']);
  });

  it('concentration above the limit is Caution', () => {
    expect(rules(input({ profile: { ...calm, concentrationPct: 25 } }))).toEqual([]);
    expect(rules(input({ profile: { ...calm, concentrationPct: 26 } }))).toEqual(['concentration']);
  });

  it('High-risk product: hard for low appetite, Caution for medium, fine for high; CPN never', () => {
    const low = assessSuitability(input({ profile: { ...calm, riskAppetite: 'low' } }));
    expect(low.verdict).toBe('Not suitable');
    expect(low.flags[0]).toMatchObject({ rule: 'risk_vs_appetite', severity: 'not_suitable' });
    const medium = assessSuitability(input({ profile: { ...calm, riskAppetite: 'medium' } }));
    expect(medium.verdict).toBe('Caution');
    expect(rules(input({ productType: 'CPN', profile: { ...calm, riskAppetite: 'low' } }))).toEqual(
      [],
    );
  });

  it('lists every raised flag whatever the verdict', () => {
    const r = assessSuitability(
      input({
        lowCase: { label: 'low', returnPct: -30, knockedIn: true },
        profile: {
          riskAppetite: 'medium',
          horizonMonths: 3,
          lossTolerancePct: 10,
          concentrationPct: 40,
        },
      }),
    );
    expect(r.verdict).toBe('Not suitable');
    expect(r.flags.map((f) => f.rule)).toEqual([
      'low_case_loss',
      'barrier_knock_in',
      'tenor_vs_horizon',
      'concentration',
      'risk_vs_appetite',
    ]);
  });
});
