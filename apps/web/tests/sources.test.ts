import { describe, expect, it } from 'vitest';
import { groupSources } from '../src/utils/sources';

describe('groupSources', () => {
  it('groups retrieval sources by document with short section names', () => {
    expect(
      groupSources([
        'products\\eln.md > ELN (reverse convertible) > What it is',
        'products\\eln.md > ELN (reverse convertible) > Barrier (knock-in) ELN',
        'products\\eln.md > ELN (reverse convertible) > What it is',
        'policy\\suitability_policy.md > Suitability policy (DRAFT) > Verdicts',
        'general/glossary.md > Glossary > Barrier and knock-in',
      ]),
    ).toEqual([
      { document: 'ELN (reverse convertible)', sections: ['What it is', 'Barrier (knock-in) ELN'] },
      { document: 'Suitability policy (draft)', sections: ['Verdicts'] },
      { document: 'Glossary', sections: ['Barrier and knock-in'] },
    ]);
  });

  it('falls back to the file name when there is no heading trail', () => {
    expect(groupSources(['products/dcd.md'])).toEqual([{ document: 'dcd', sections: [] }]);
  });
});
