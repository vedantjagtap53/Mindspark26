// The repository contract and the whole app against a real local Supabase. Skipped unless
// SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY and SUPABASE_TEST_DB_URL are set (see
// DATABASE_SCHEMA.md, "Testing against a local Supabase").
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { buildConfig } from '../../src/config/index.js';
import { parseEnv } from '../../src/config/env.js';
import { createSupabaseClient } from '../../src/repositories/supabase/supabaseClient.js';
import { createSupabaseRepositories } from '../../src/repositories/supabase/supabaseRepositories.js';
import { runRepositoryContract } from '../contract/repositoryContract.js';
import { runUserRepositoryContract } from '../contract/userRepositoryContract.js';
import { runAccountsFlow } from './accountsFlow.js';
import { runPersistenceFlow } from './persistenceFlow.js';

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const dbUrl = process.env.SUPABASE_TEST_DB_URL;
const enabled = Boolean(url && key && dbUrl);

const config = buildConfig(
  parseEnv(enabled ? { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } : {}),
);

const pool = enabled ? new pg.Pool({ connectionString: dbUrl, max: 1 }) : undefined;
afterAll(() => pool?.end());

/** Test-only: empties every table. Refuses to run against anything but a local database. */
async function resetLocalDatabase(): Promise<void> {
  const host = new URL(dbUrl!).hostname;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    throw new Error(`Refusing to reset a non-local database (${host})`);
  }
  // TRUNCATE bypasses the row-level triggers that make audit tables append-only.
  await pool!.query(
    'truncate explanations, suitability_results, risk_results, simulations, product_configurations, refresh_tokens, activity_events, app_users',
  );
}

describe.skipIf(!enabled)('Supabase adapter (local database)', () => {
  runRepositoryContract('Supabase (local)', async () => {
    await resetLocalDatabase();
    return createSupabaseRepositories(createSupabaseClient(config.database));
  });

  runUserRepositoryContract('Supabase (local)', async () => {
    await resetLocalDatabase();
    return createSupabaseRepositories(createSupabaseClient(config.database));
  });

  it('keeps audit records append-only, even for the service role', async () => {
    await resetLocalDatabase();
    const db = createSupabaseClient(config.database);
    const repos = createSupabaseRepositories(db);
    const id = await repos.productConfigurations.create({
      productType: 'CPN',
      underlyingSymbol: '^NSEI',
      depositCurrency: null,
      alternateCurrency: null,
      tenorDays: 365,
      notional: 1e6,
      terms: {},
    });
    const del = await db.from('product_configurations').delete().eq('id', id);
    const upd = await db.from('product_configurations').update({ notional: 1 }).eq('id', id);
    expect(del.error?.code).toBe('42501');
    expect(upd.error?.code).toBe('42501');
    expect(await repos.productConfigurations.getById(id)).toMatchObject({ notional: 1e6 });
  });
});

describe.skipIf(!enabled)('schema after the client-profile removal (local database)', () => {
  it('has no client_profiles table and no simulations.profile_id column', async () => {
    const t = await pool!.query("select to_regclass('public.client_profiles') as t");
    expect((t.rows[0] as { t: string | null }).t).toBeNull();
    const c = await pool!.query(
      "select 1 from information_schema.columns where table_name = 'simulations' and column_name = 'profile_id'",
    );
    expect(c.rowCount).toBe(0);
  });

  it('writes nothing when a simulation cannot be recorded', async () => {
    await resetLocalDatabase();
    const repos = createSupabaseRepositories(createSupabaseClient(config.database));
    const err = await repos.simulations
      .record({
        mode: 'B',
        configurationId: '00000000-0000-4000-8000-000000000000',
        userId: null,
        profileSnapshot: null,
        levelValue: 25_000,
        levelSource: 'manual',
        levelAsOf: null,
        shockPct: -10,
        shockedLevel: 22_500,
        riskResults: [
          {
            scenario: 'shock',
            percentile: null,
            terminal: 22_500,
            pathMin: null,
            payoff: 1,
            returnPct: 0,
            lossAmount: 0,
            knockedIn: null,
            details: {},
          },
        ],
      })
      .catch((e: unknown) => e);
    expect((err as { kind?: string }).kind).toBe('invalid_reference');
    const n = await pool!.query(
      'select (select count(*) from simulations) as sims, (select count(*) from risk_results) as risks',
    );
    expect(n.rows[0]).toEqual({ sims: '0', risks: '0' });
  });
});

describe.skipIf(!enabled)('persistence through the app (local database)', () => {
  runPersistenceFlow(config);
});

describe.skipIf(!enabled)(
  'accounts, saved runs and admin analytics through the app (local database)',
  () => {
    runAccountsFlow({ url: url!, key: key!, reset: resetLocalDatabase });
  },
);
