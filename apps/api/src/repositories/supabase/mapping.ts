// Translation between the application's vocabulary and the database's enums and formats.

import type { LevelSource, SuitabilityVerdict } from '@mindspark/shared';
import type { ScenarioCase } from '../interfaces/index.js';

const invert = <K extends string, V extends string>(m: Record<K, V>): Record<V, K> =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<V, K>;

function lookup<V>(map: Record<string, V>, key: string, what: string): V {
  const v = map[key];
  if (v === undefined) throw new Error(`Unexpected ${what} value from the database: ${key}`);
  return v;
}

const LEVEL_SOURCE: Record<LevelSource, string> = {
  live: 'LIVE',
  manual: 'MANUAL',
  reference: 'REFERENCE',
};
const SCENARIO: Record<ScenarioCase, string> = {
  low: 'LOW',
  base: 'BASE',
  high: 'HIGH',
  shock: 'SHOCK',
};
const VERDICT: Record<SuitabilityVerdict, string> = {
  Suitable: 'SUITABLE',
  Caution: 'CAUTION',
  'Not suitable': 'NOT_SUITABLE',
};

export const toDb = {
  levelSource: (v: LevelSource) => LEVEL_SOURCE[v],
  scenario: (v: ScenarioCase) => SCENARIO[v],
  verdict: (v: SuitabilityVerdict) => VERDICT[v],
};

export const fromDb = {
  levelSource: (v: string) => lookup(invert(LEVEL_SOURCE), v, 'level source'),
  scenario: (v: string) => lookup(invert(SCENARIO), v, 'scenario'),
  verdict: (v: string) => lookup(invert(VERDICT), v, 'verdict'),
};

/** Postgres timestamps carry microseconds and an offset; normalize to ISO with milliseconds. */
export const toIso = (ts: string) => new Date(ts).toISOString();
