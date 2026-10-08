import { describe, expect, it } from 'vitest';
import { termIssues } from '../src/schemas/terms';
import {
  DEFAULT_FORMS,
  DEFAULT_RUN,
  runBlocker,
  runSettingsFor,
  simulateRequest,
  type Forms,
} from '../src/state/forms';

describe('termIssues (shared schemas)', () => {
  it('accepts the default terms of every product', () => {
    expect(termIssues('ELN', DEFAULT_FORMS)).toEqual({});
    expect(termIssues('DCD', DEFAULT_FORMS)).toEqual({});
    expect(termIssues('CPN', DEFAULT_FORMS)).toEqual({});
  });

  it('reports a barrier at or above the strike on the barrier field', () => {
    const forms: Forms = { ...DEFAULT_FORMS, ELN: { ...DEFAULT_FORMS.ELN, barrierPct: 100 } };
    expect(Object.keys(termIssues('ELN', forms))).toEqual(['barrierPct']);
  });

  it('reports a tenor outside 30–1,095 days and a cleared number box', () => {
    const forms: Forms = {
      ...DEFAULT_FORMS,
      CPN: { ...DEFAULT_FORMS.CPN, tenorDays: 20, notional: Number.NaN },
    };
    expect(Object.keys(termIssues('CPN', forms)).sort()).toEqual(['notional', 'tenorDays']);
  });

  it('ignores the barrier fields of a plain ELN', () => {
    const forms: Forms = {
      ...DEFAULT_FORMS,
      ELN: { ...DEFAULT_FORMS.ELN, barrierEnabled: false, barrierPct: 150 },
    };
    expect(termIssues('ELN', forms)).toEqual({});
  });
});

describe('runSettingsFor', () => {
  it('keeps Mode A for DCD and moves a live level to the strike rate', () => {
    const next = runSettingsFor('ELN', 'DCD', { ...DEFAULT_RUN, mode: 'A', levelSource: 'live' });
    expect(next.mode).toBe('A');
    expect(next.levelSource).toBe('strike');
  });

  it('moves ELN/CPN off the FX reference rate to a typed level, not the live feed', () => {
    const next = runSettingsFor('DCD', 'CPN', { ...DEFAULT_RUN, levelSource: 'reference' });
    expect(next.levelSource).toBe('manual');
  });

  it('clears a typed level when switching between an index and an FX rate only', () => {
    const run = { ...DEFAULT_RUN, levelSource: 'manual' as const, manualLevel: 25_000 };
    expect(runSettingsFor('ELN', 'DCD', run).manualLevel).toBeNull();
    expect(runSettingsFor('ELN', 'CPN', run).manualLevel).toBe(25_000);
  });

  it('starts a DCD from the strike rate the RM entered, so Run simulation is not blocked', () => {
    const run = runSettingsFor('ELN', 'DCD', DEFAULT_RUN);
    expect(run.levelSource).toBe('strike');
    expect(runBlocker('DCD', run)).toBeNull();
    const body = simulateRequest('DCD', DEFAULT_FORMS, { ...run, shockPct: 10 });
    expect(body).toMatchObject({
      mode: 'B',
      productType: 'DCD',
      shockPct: 10,
      level: { source: 'manual', value: DEFAULT_FORMS.DCD.strikeRate },
    });
  });

  it('follows the strike when the RM changes it, and leaves a chosen reference rate alone', () => {
    const forms = { ...DEFAULT_FORMS, DCD: { ...DEFAULT_FORMS.DCD, strikeRate: 86.2 } };
    const strike = runSettingsFor('ELN', 'DCD', DEFAULT_RUN);
    expect(simulateRequest('DCD', forms, strike)).toMatchObject({
      level: { source: 'manual', value: 86.2 },
    });
    const reference = { ...DEFAULT_RUN, levelSource: 'reference' as const };
    expect(runSettingsFor('DCD', 'DCD', reference).levelSource).toBe('reference');
  });

  it('turns the DCD-only sources into a typed level when leaving a DCD', () => {
    const run = runSettingsFor('DCD', 'ELN', { ...DEFAULT_RUN, levelSource: 'strike' });
    expect(run.levelSource).toBe('manual');
  });

  it('keeps an FX rate the RM already typed for a DCD', () => {
    const typed = { ...DEFAULT_RUN, levelSource: 'manual' as const, manualLevel: 84.5 };
    const run = runSettingsFor('DCD', 'DCD', typed);
    expect(run.levelSource).toBe('manual');
    expect(run.manualLevel).toBe(84.5);
  });
});

describe('simulateRequest', () => {
  it('builds a Mode B manual-level request', () => {
    const body = simulateRequest('ELN', DEFAULT_FORMS, {
      ...DEFAULT_RUN,
      mode: 'B',
      shockPct: -10,
      levelSource: 'manual',
      manualLevel: 25_000,
    });
    expect(body).toMatchObject({
      mode: 'B',
      productType: 'ELN',
      shockPct: -10,
      level: { source: 'manual', value: 25_000 },
    });
  });

  it('builds a Mode A request with the training window and no shock', () => {
    const body = simulateRequest('CPN', DEFAULT_FORMS, {
      ...DEFAULT_RUN,
      mode: 'A',
      trainingWindowDays: 730,
    });
    expect(Object.keys(body).sort()).toEqual([
      'mode',
      'productType',
      'terms',
      'trainingWindowYears',
    ]);
    expect(body).toMatchObject({ mode: 'A', productType: 'CPN', trainingWindowYears: 2 });
  });

  it('sends the training window in years across the whole 30-day to 3-year range', () => {
    const years = (trainingWindowDays: number) =>
      (
        simulateRequest('ELN', DEFAULT_FORMS, {
          ...DEFAULT_RUN,
          mode: 'A',
          trainingWindowDays,
        }) as {
          trainingWindowYears: number;
        }
      ).trainingWindowYears;
    expect(years(30)).toBe(30 / 365);
    expect(years(365)).toBe(1);
    expect(years(1095)).toBe(3);
    expect(DEFAULT_RUN.trainingWindowDays).toBe(1095);
  });
});
