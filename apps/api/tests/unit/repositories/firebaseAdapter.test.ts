import { describe, expect, it } from 'vitest';
import { buildConfig } from '../../../src/config/index.js';
import { parseEnv } from '../../../src/config/env.js';
import {
  createDataConnectRunner,
  toRepositoryError,
  type OperationRunner,
  type OperationVariables,
} from '../../../src/repositories/firebase/dataConnectRunner.js';
import { createFirebaseRepositories } from '../../../src/repositories/firebase/firebaseRepositories.js';
import { fromDb, toDb, toIso, toUuid } from '../../../src/repositories/firebase/mapping.js';
import {
  RepositoryError,
  type ModeBSimulationInput,
} from '../../../src/repositories/interfaces/index.js';

const HEX = '0b130d38810d4c928c9a3cca20440c2b';
const UUID = '0b130d38-810d-4c92-8c9a-3cca20440c2b';

function fakeRunner(responses: Record<string, unknown> = {}) {
  const calls: Array<{ kind: 'query' | 'mutation'; name: string; vars: OperationVariables }> = [];
  const respond = <T>(kind: 'query' | 'mutation', name: string, vars: OperationVariables) => {
    calls.push({ kind, name, vars });
    return Promise.resolve(responses[name] as T);
  };
  const runner: OperationRunner = {
    query: (name, vars) => respond('query', name, vars),
    mutation: (name, vars) => respond('mutation', name, vars),
  };
  return { runner, calls };
}

describe('mapping', () => {
  it('converts SQL Connect UUIDs to the canonical form', () => {
    expect(toUuid(HEX)).toBe(UUID);
    expect(toUuid(UUID.toUpperCase())).toBe(UUID);
    expect(() => toUuid('not-a-uuid')).toThrow();
  });

  it('normalizes microsecond timestamps to ISO milliseconds', () => {
    expect(toIso('2026-10-03T21:07:25.638722Z')).toBe('2026-10-03T21:07:25.638Z');
  });

  it('maps every enum both ways', () => {
    expect(toDb.verdict('Not suitable')).toBe('NOT_SUITABLE');
    expect(fromDb.verdict('NOT_SUITABLE')).toBe('Not suitable');
    expect(toDb.levelSource('reference')).toBe('REFERENCE');
    expect(fromDb.scenario('SHOCK')).toBe('shock');
    expect(fromDb.riskAppetite('MEDIUM')).toBe('medium');
    expect(() => fromDb.verdict('MAYBE')).toThrow(/Unexpected verdict/);
  });
});

describe('error mapping', () => {
  const dcError = (code: string, message: string) => Object.assign(new Error(message), { code });

  it.each([
    [
      dcError(
        'data-connect/query-error',
        'violates SQL unique constraint: client_profiles_clientRef_uidx',
      ),
      'conflict',
    ],
    [
      dcError(
        'data-connect/query-error',
        'violates SQL foreign key constraint: simulations_configuration_id_fkey',
      ),
      'invalid_reference',
    ],
    [dcError('data-connect/unauthenticated', 'bad token'), 'unavailable'],
    [dcError('data-connect/query-error', 'some other failure'), 'unavailable'],
    [new TypeError("Cannot read properties of undefined (reading 'isJson')"), 'unavailable'],
  ] as const)('%s → %s', (err, kind) => {
    expect(toRepositoryError(err).kind).toBe(kind);
  });

  it('passes RepositoryErrors through unchanged', () => {
    const e = new RepositoryError('conflict', 'x');
    expect(toRepositoryError(e)).toBe(e);
  });

  it('refuses to start without project, service and location', () => {
    const db = buildConfig(parseEnv({ FIREBASE_PROJECT_ID: 'p' })).database;
    let err: unknown;
    try {
      createDataConnectRunner(db);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RepositoryError);
    expect((err as RepositoryError).kind).toBe('not_configured');
  });
});

describe('Firebase repositories (fake runner)', () => {
  it('sends database enums and returns canonical ids', async () => {
    const { runner, calls } = fakeRunner({
      CreateClientProfile: { clientProfile_insert: { id: HEX } },
    });
    const id = await createFirebaseRepositories(runner).clientProfiles.create({
      clientRef: 'CRM-1',
      label: null,
      riskAppetite: 'high',
      horizonMonths: 12,
      lossTolerancePct: 5,
      concentrationPct: 10,
    });
    expect(id).toBe(UUID);
    expect(calls[0]).toMatchObject({
      kind: 'mutation',
      name: 'CreateClientProfile',
      vars: { riskAppetite: 'HIGH' },
    });
  });

  const modeBInput = (riskResults: ModeBSimulationInput['riskResults']): ModeBSimulationInput => ({
    mode: 'B',
    configurationId: UUID,
    profileId: null,
    profileSnapshot: null,
    levelValue: 25_000,
    levelSource: 'live',
    levelAsOf: '2026-10-05T04:15:00.000Z',
    shockPct: -10,
    shockedLevel: 22_500,
    riskResults,
  });

  it('sends only the Mode B fields for a Mode B simulation, with database enums', async () => {
    const { runner, calls } = fakeRunner({ RecordSimulation: { simulation_insert: { id: HEX } } });
    await createFirebaseRepositories(runner).simulations.record(
      modeBInput([
        {
          scenario: 'shock',
          percentile: null,
          terminal: 22_500,
          pathMin: null,
          payoff: 1,
          returnPct: 0,
          lossAmount: 0,
          knockedIn: false,
          details: {},
        },
      ]),
    );
    const vars = calls[0]!.vars;
    expect(vars).toMatchObject({
      mode: 'B',
      levelSource: 'LIVE',
      riskResults: [{ scenario: 'SHOCK' }],
    });
    expect(vars).not.toHaveProperty('forecastMeta');
    expect(vars).not.toHaveProperty('payoffP5');
  });

  it('validates the input before calling the database', async () => {
    const { runner, calls } = fakeRunner();
    const err = await createFirebaseRepositories(runner)
      .simulations.record(modeBInput([]))
      .catch((e: unknown) => e);
    expect((err as RepositoryError).kind).toBe('invalid_input');
    expect(calls).toHaveLength(0);
  });

  it('maps a stored Mode B simulation back to the application vocabulary', async () => {
    const ts = '2026-10-03T21:00:01.000001Z';
    const { runner } = fakeRunner({
      GetSimulation: {
        simulation: {
          id: HEX,
          profile: null,
          configuration: {
            id: HEX,
            productType: 'CPN',
            underlyingSymbol: '^NSEI',
            depositCurrency: null,
            alternateCurrency: null,
            tenorDays: 365,
            notional: 1e6,
            terms: {},
            createdAt: '2026-10-03T21:00:00.123456Z',
          },
          mode: 'B',
          profileSnapshot: {
            clientRef: 'C',
            label: null,
            riskAppetite: 'LOW',
            horizonMonths: 1,
            lossTolerancePct: 1,
            concentrationPct: 1,
          },
          levelValue: 25_000,
          levelSource: 'MANUAL',
          levelAsOf: null,
          shockPct: 5,
          shockedLevel: 26_250,
          trainingWindowYears: null,
          forecastMeta: null,
          pathCount: null,
          probabilityOfLoss: null,
          probabilityOfKnockIn: null,
          payoffP5: null,
          payoffP50: null,
          payoffP95: null,
          createdAt: ts,
          riskResults_on_simulation: [
            {
              scenario: 'SHOCK',
              percentile: null,
              terminal: 26_250,
              pathMin: null,
              payoff: 1.03e6,
              returnPct: 3,
              lossAmount: 0,
              knockedIn: null,
              details: {},
              createdAt: ts,
            },
          ],
          suitabilityResult_on_simulation: {
            id: HEX,
            verdict: 'NOT_SUITABLE',
            flags: [],
            rulesVersion: 'v1',
            createdAt: ts,
          },
          explanations_on_simulation: [],
        },
      },
    });
    const rec = await createFirebaseRepositories(runner).simulations.getById(UUID);
    expect(rec).toMatchObject({
      id: UUID,
      mode: 'B',
      levelSource: 'manual',
      profileSnapshot: { riskAppetite: 'low' },
      riskResults: [{ scenario: 'shock' }],
      suitability: { verdict: 'Not suitable', id: UUID },
      configuration: { id: UUID, createdAt: '2026-10-03T21:00:00.123Z' },
    });
  });

  it('exposes no delete operations', () => {
    const repos = createFirebaseRepositories(fakeRunner().runner);
    for (const repo of Object.values(repos) as object[]) {
      expect(Object.keys(repo).filter((k) => /delete|remove|destroy/i.test(k))).toEqual([]);
    }
  });
});
