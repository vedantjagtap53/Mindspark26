// The Supabase adapter driven through the real supabase-js client, with fetch replaced by a fake
// PostgREST. The adapter against a real database is covered by tests/supabase.
import { describe, expect, it } from 'vitest';
import { buildConfig } from '../../../src/config/index.js';
import { parseEnv } from '../../../src/config/env.js';
import { fromDb, toDb, toIso } from '../../../src/repositories/supabase/mapping.js';
import {
  createSupabaseClient,
  toRepositoryError,
} from '../../../src/repositories/supabase/supabaseClient.js';
import { createSupabaseRepositories } from '../../../src/repositories/supabase/supabaseRepositories.js';
import {
  RepositoryError,
  type ModeBSimulationInput,
  type SuitabilityResultInput,
} from '../../../src/repositories/interfaces/index.js';

const UUID = '0b130d38-810d-4c92-8c9a-3cca20440c2b';
const DB = buildConfig(
  parseEnv({ SUPABASE_URL: 'http://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }),
).database;

interface Call {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
  headers: Headers;
}

type Reply = { status?: number; body: unknown };

/** A fake PostgREST: `reply` picks the response for each request. */
function fakeDb(reply: (call: Call) => Reply = () => ({ body: [] })) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init?.headers);
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.searchParams,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      headers,
    };
    calls.push(call);
    const { status = 200, body } = reply(call);
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { repos: createSupabaseRepositories(createSupabaseClient(DB, fetchImpl)), calls };
}

/** `.single()` / `.maybeSingle()` ask PostgREST for an object instead of a list. */
const wantsObject = (c: Call) => c.headers.get('accept')?.includes('vnd.pgrst.object') ?? false;

describe('mapping', () => {
  it('normalizes Postgres timestamps to ISO milliseconds', () => {
    expect(toIso('2026-10-03T21:07:25.638722+00:00')).toBe('2026-10-03T21:07:25.638Z');
  });

  it('maps every enum both ways', () => {
    expect(toDb.verdict('Not suitable')).toBe('NOT_SUITABLE');
    expect(fromDb.verdict('NOT_SUITABLE')).toBe('Not suitable');
    expect(toDb.levelSource('reference')).toBe('REFERENCE');
    expect(fromDb.scenario('SHOCK')).toBe('shock');
    expect(() => fromDb.verdict('MAYBE')).toThrow(/Unexpected verdict/);
  });
});

describe('error mapping', () => {
  const pg = (code: string, message = 'boom') => ({ code, message });

  it.each([
    [pg('23505', 'duplicate key value violates unique constraint'), 409, 'conflict'],
    [pg('23503', 'violates foreign key constraint'), 409, 'invalid_reference'],
    [pg('22P02', 'invalid input syntax for type uuid'), 400, 'invalid_input'],
    [pg('PGRST301', 'JWT expired'), 401, 'unavailable'],
    [{ message: 'Invalid API key' }, 401, 'unavailable'],
    [pg('42501', 'audit records are append-only'), 403, 'unavailable'],
    [pg('XX000', 'internal'), 500, 'unavailable'],
    [{ code: '', message: 'TypeError: fetch failed' }, 0, 'unavailable'],
  ] as const)('%j (HTTP %i) → %s', (err, status, kind) => {
    expect(toRepositoryError(err, status).kind).toBe(kind);
  });

  it('says when Supabase cannot be reached, and why', () => {
    expect(toRepositoryError({ code: '', message: 'fetch failed' }, 0).message).toBe(
      'Supabase is unreachable (fetch failed)',
    );
    const withCause = toRepositoryError(
      { code: '', message: 'TypeError: fetch failed', details: 'cause: getaddrinfo ENOTFOUND' },
      0,
    );
    expect(withCause.message).toBe(
      'Supabase is unreachable (TypeError: fetch failed: cause: getaddrinfo ENOTFOUND)',
    );
  });

  it('tells a timeout apart from a connection failure', () => {
    const err = toRepositoryError(
      { code: '', message: 'AbortError: The operation was aborted due to timeout' },
      0,
    );
    expect(err.kind).toBe('unavailable');
    expect(err.message).toMatch(/did not answer within 10 s/);
  });

  it('points at the URL when the server answers without a database error', () => {
    expect(toRepositoryError({ message: 'Not Found' }, 404).message).toMatch(
      /HTTP 404 .*check SUPABASE_URL/,
    );
  });

  it('says the schema is missing when a table or function does not exist', () => {
    const err = toRepositoryError(
      { code: 'PGRST205', message: "Could not find the table 'public.client_profiles'" },
      404,
    );
    expect(err.kind).toBe('unavailable');
    expect(err.message).toMatch(/schema is missing; apply supabase\/migrations/);
  });

  it('passes RepositoryErrors through unchanged', () => {
    const e = new RepositoryError('conflict', 'x');
    expect(toRepositoryError(e)).toBe(e);
  });

  it('refuses to start without the URL and service-role key', () => {
    const db = buildConfig(parseEnv({})).database;
    let err: unknown;
    try {
      createSupabaseClient(db);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RepositoryError);
    expect((err as RepositoryError).kind).toBe('not_configured');
  });

  it('maps an HTTP error response from the database', async () => {
    const { repos } = fakeDb(() => ({
      status: 409,
      body: { code: '23505', message: 'duplicate key', details: null, hint: null },
    }));
    const err = await repos.suitabilityResults
      .create({ simulationId: UUID, verdict: 'Caution', flags: [], rulesVersion: 'v1' })
      .catch((e: unknown) => e);
    expect((err as RepositoryError).kind).toBe('conflict');
  });

  const connectError = (code: string) =>
    Object.assign(new TypeError('fetch failed'), { cause: { code } });
  const verdict: SuitabilityResultInput = {
    simulationId: UUID,
    verdict: 'Caution',
    flags: [],
    rulesVersion: 'v1',
  };

  it('retries a connection failure, before anything was sent, and then succeeds', async () => {
    let attempts = 0;
    const flaky: typeof fetch = () => {
      attempts++;
      if (attempts < 3) return Promise.reject(connectError('UND_ERR_CONNECT_TIMEOUT'));
      return Promise.resolve(
        new Response(JSON.stringify({ id: UUID }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
    const repos = createSupabaseRepositories(createSupabaseClient(DB, flaky));
    expect(await repos.suitabilityResults.create(verdict)).toBe(UUID);
    expect(attempts).toBe(3);
  });

  it('gives up after two retries and reports the failure', async () => {
    let attempts = 0;
    const down: typeof fetch = () => {
      attempts++;
      return Promise.reject(connectError('ECONNREFUSED'));
    };
    const repos = createSupabaseRepositories(createSupabaseClient(DB, down));
    const err = await repos.suitabilityResults.create(verdict).catch((e: unknown) => e);
    expect((err as RepositoryError).kind).toBe('unavailable');
    expect(attempts).toBe(3);
  });

  it('never retries a failure that may have reached the server', async () => {
    let attempts = 0;
    const reset: typeof fetch = () => {
      attempts++;
      return Promise.reject(connectError('ECONNRESET'));
    };
    const repos = createSupabaseRepositories(createSupabaseClient(DB, reset));
    await repos.suitabilityResults.create(verdict).catch(() => undefined);
    expect(attempts).toBe(1);
  });

  it('maps a network failure to unavailable', async () => {
    const failing: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));
    const repos = createSupabaseRepositories(createSupabaseClient(DB, failing));
    const err = await repos.explanations
      .create({ simulationId: UUID, text: 't', model: 'm', sources: null })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RepositoryError);
    expect((err as RepositoryError).kind).toBe('unavailable');
  });
});

describe('Supabase repositories (fake PostgREST)', () => {
  it('sends the service-role key and database enums, and returns the new id', async () => {
    const { repos, calls } = fakeDb(() => ({ status: 201, body: { id: UUID } }));
    const id = await repos.suitabilityResults.create({
      simulationId: UUID,
      verdict: 'Not suitable',
      flags: [{ rule: 'low_case_loss', hard: true, reason: 'Loss above tolerance' }],
      rulesVersion: 'v1',
    });
    expect(id).toBe(UUID);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/rest/v1/suitability_results',
      body: { simulation_id: UUID, verdict: 'NOT_SUITABLE', rules_version: 'v1' },
    });
    expect(calls[0]!.headers.get('apikey')).toBe('service-key');
  });

  const modeBInput = (riskResults: ModeBSimulationInput['riskResults']): ModeBSimulationInput => ({
    mode: 'B',
    configurationId: UUID,
    profileSnapshot: null,
    levelValue: 25_000,
    levelSource: 'live',
    levelAsOf: '2026-10-05T04:15:00.000Z',
    shockPct: -10,
    shockedLevel: 22_500,
    riskResults,
  });

  it('records a Mode B simulation in one RPC with only Mode B fields', async () => {
    const { repos, calls } = fakeDb(() => ({ body: UUID }));
    const id = await repos.simulations.record(
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
    expect(id).toBe(UUID);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/rest/v1/rpc/record_simulation',
      body: {
        simulation: { mode: 'B', level_source: 'LIVE', shock_pct: -10 },
        risk_results: [{ scenario: 'SHOCK', return_pct: 0, knocked_in: false }],
      },
    });
    const { simulation } = calls[0]!.body as { simulation: object };
    expect(simulation).not.toHaveProperty('forecast_meta');
    expect(simulation).not.toHaveProperty('payoff_p5');
  });

  it('validates the input before calling the database', async () => {
    const { repos, calls } = fakeDb();
    const err = await repos.simulations.record(modeBInput([])).catch((e: unknown) => e);
    expect((err as RepositoryError).kind).toBe('invalid_input');
    expect(calls).toHaveLength(0);
  });

  it('maps a stored Mode B simulation back to the application vocabulary', async () => {
    const ts = '2026-10-03T21:00:01.000001+00:00';
    const row = {
      id: UUID,
      configuration: {
        id: UUID,
        product_type: 'CPN',
        underlying_symbol: '^NSEI',
        deposit_currency: null,
        alternate_currency: null,
        tenor_days: 365,
        notional: 1e6,
        terms: {},
        created_at: '2026-10-03T21:00:00.123456+00:00',
      },
      mode: 'B',
      profile_snapshot: {
        name: 'Asha Rao',
        age: 52,
        riskAppetite: 'low',
        horizonMonths: 1,
        lossTolerancePct: 1,
        concentrationPct: 1,
      },
      level_value: 25_000,
      level_source: 'MANUAL',
      level_as_of: null,
      shock_pct: 5,
      shocked_level: 26_250,
      training_window_years: null,
      forecast_meta: null,
      path_count: null,
      probability_of_loss: null,
      probability_of_knock_in: null,
      payoff_p5: null,
      payoff_p50: null,
      payoff_p95: null,
      created_at: ts,
      risk_results: [
        {
          scenario: 'SHOCK',
          percentile: null,
          terminal: 26_250,
          path_min: null,
          payoff: 1.03e6,
          return_pct: 3,
          loss_amount: 0,
          knocked_in: null,
          details: {},
          created_at: ts,
        },
      ],
      suitability_results: {
        id: UUID,
        verdict: 'NOT_SUITABLE',
        flags: [],
        rules_version: 'v1',
        created_at: ts,
      },
      explanations: [],
    };
    const { repos, calls } = fakeDb((c) => ({ body: wantsObject(c) ? row : [row] }));
    const rec = await repos.simulations.getById(UUID);
    expect(calls[0]!.path).toBe('/rest/v1/simulations');
    expect(rec).toMatchObject({
      id: UUID,
      mode: 'B',
      levelSource: 'manual',
      profileSnapshot: { name: 'Asha Rao', age: 52, riskAppetite: 'low' },
      riskResults: [{ scenario: 'shock', returnPct: 3 }],
      suitability: { verdict: 'Not suitable', id: UUID, rulesVersion: 'v1' },
      configuration: { id: UUID, productType: 'CPN', createdAt: '2026-10-03T21:00:00.123Z' },
    });
  });

  it('returns null for an unknown simulation', async () => {
    const { repos } = fakeDb((c) =>
      wantsObject(c)
        ? { status: 406, body: { code: 'PGRST116', message: 'no rows', details: null, hint: null } }
        : { body: [] },
    );
    expect(await repos.simulations.getById(UUID)).toBeNull();
  });

  it('exposes no delete operations', () => {
    const { repos } = fakeDb();
    for (const repo of Object.values(repos) as object[]) {
      expect(Object.keys(repo).filter((k) => /delete|remove|destroy/i.test(k))).toEqual([]);
    }
  });
});
