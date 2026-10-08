// The warnings shown above a comparison: whatever differs between the runs besides the product.
import { describe, expect, it } from 'vitest';
import { comparisonNotes } from '../src/components/simulation/CompareRuns';
import { DEFAULT_PROFILE } from '../src/state/forms';
import type { SessionRun } from '../src/types/session';

/** Only the fields the notes read; the rest of a run does not matter here. */
const run = (over: {
  product?: SessionRun['product'];
  mode?: 'A' | 'B';
  shockPct?: number;
  profile?: Partial<SessionRun['profile']>;
  depositCurrency?: string;
}): SessionRun =>
  ({
    id: 'run',
    at: '2026-10-08T00:00:00.000Z',
    product: over.product ?? 'ELN',
    profile: { ...DEFAULT_PROFILE, ...over.profile },
    terms: over.depositCurrency ? { depositCurrency: over.depositCurrency } : {},
    response:
      (over.mode ?? 'B') === 'B'
        ? { mode: 'B', shock: { pct: over.shockPct ?? -10 } }
        : { mode: 'A' },
    chat: [],
  }) as unknown as SessionRun;

describe('comparisonNotes', () => {
  it('has nothing to say about runs for the same client, mode, shock and currency', () => {
    expect(comparisonNotes([run({}), run({ product: 'CPN' })])).toEqual([]);
  });

  it('warns when the runs were checked against different clients', () => {
    const notes = comparisonNotes([run({}), run({ profile: { lossTolerancePct: 25 } })]);
    expect(notes).toEqual([expect.stringMatching(/different client profiles/)]);
  });

  it('warns that Mode A and Mode B figures are not like for like', () => {
    expect(comparisonNotes([run({ mode: 'A' }), run({})])).toEqual([
      expect.stringMatching(/not like for like/),
    ]);
  });

  it('warns about different shocks between Mode B runs', () => {
    expect(comparisonNotes([run({}), run({ shockPct: 15 })])).toEqual([
      'The Mode B runs use different shocks.',
    ]);
  });

  it('warns that amounts in different currencies are not converted', () => {
    const notes = comparisonNotes([run({}), run({ product: 'DCD', depositCurrency: 'usd' })]);
    expect(notes).toEqual([expect.stringMatching(/own currency/)]);
  });
});
