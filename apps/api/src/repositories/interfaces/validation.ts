// Rules every repository implementation enforces before writing, so behaviour does not depend on
// the database. Field ranges (percentages, tenor) are validated earlier by the API's Zod schemas.

import { RepositoryError } from './errors.js';
import type { ScenarioCase, SimulationInput } from './records.js';

const MODE_SCENARIOS: Record<SimulationInput['mode'], readonly ScenarioCase[]> = {
  A: ['low', 'base', 'high'],
  B: ['shock'],
};

/** Mode A must store exactly low/base/high; Mode B exactly one shock row. */
export function validateSimulationInput(input: SimulationInput): void {
  const expected = MODE_SCENARIOS[input.mode];
  const got = input.riskResults.map((r) => r.scenario);
  const unique = new Set(got);
  if (unique.size !== got.length) {
    throw new RepositoryError(
      'invalid_input',
      `Duplicate risk result scenarios: ${got.join(', ')}`,
    );
  }
  if (got.length !== expected.length || !expected.every((s) => unique.has(s))) {
    throw new RepositoryError(
      'invalid_input',
      `Mode ${input.mode} needs risk results for ${expected.join(', ')}; got ${got.join(', ') || 'none'}`,
    );
  }
  for (const r of input.riskResults) {
    const isCase = r.scenario !== 'shock';
    if (isCase !== (r.percentile !== null) || isCase !== (r.pathMin !== null)) {
      throw new RepositoryError(
        'invalid_input',
        `Risk result ${r.scenario}: percentile and pathMin are required for Mode A cases and must be null for Mode B`,
      );
    }
  }
}
