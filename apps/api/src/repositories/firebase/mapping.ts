// Translation between the application's vocabulary and SQL Connect's enums and formats.

import type { LevelSource, SuitabilityVerdict } from '@mindspark/shared';
import type { RiskAppetite, ScenarioCase } from '../interfaces/index.js';

const invert = <K extends string, V extends string>(m: Record<K, V>): Record<V, K> =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<V, K>;

function lookup<V>(map: Record<string, V>, key: string, what: string): V {
  const v = map[key];
  if (v === undefined) throw new Error(`Unexpected ${what} value from the database: ${key}`);
  return v;
}

const RISK_APPETITE: Record<RiskAppetite, string> = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' };
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
  riskAppetite: (v: RiskAppetite) => RISK_APPETITE[v],
  levelSource: (v: LevelSource) => LEVEL_SOURCE[v],
  scenario: (v: ScenarioCase) => SCENARIO[v],
  verdict: (v: SuitabilityVerdict) => VERDICT[v],
};

export const fromDb = {
  riskAppetite: (v: string) => lookup(invert(RISK_APPETITE), v, 'risk appetite'),
  levelSource: (v: string) => lookup(invert(LEVEL_SOURCE), v, 'level source'),
  scenario: (v: string) => lookup(invert(SCENARIO), v, 'scenario'),
  verdict: (v: string) => lookup(invert(VERDICT), v, 'verdict'),
};

/** SQL Connect returns UUIDs as 32 hex digits; the application uses the canonical hyphenated form. */
export function toUuid(id: string): string {
  const hex = id.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`Not a UUID: ${id}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** SQL Connect timestamps carry microseconds; normalize to ISO with milliseconds. */
export const toIso = (ts: string) => new Date(ts).toISOString();
