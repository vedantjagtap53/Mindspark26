// Accounts, saved runs, the activity log and the admin analytics through the real HTTP API and the
// real Supabase adapter. Run from supabaseRepositories.local.test.ts (so it never overlaps the
// contract suite, which empties the tables) and only against a local database.
import request from 'supertest';
import { expect, it } from 'vitest';
import type {
  ActivityResponse,
  AdminAnalytics,
  AuditSimulationsResponse,
  SavedRunResponse,
  SavedRunsResponse,
} from '@mindspark/shared';
import { createApp } from '../../src/app.js';
import { buildConfig } from '../../src/config/index.js';
import { parseEnv } from '../../src/config/env.js';
import { createSupabaseClient } from '../../src/repositories/supabase/supabaseClient.js';
import { createSupabaseRepositories } from '../../src/repositories/supabase/supabaseRepositories.js';
import { createMarketDataService } from '../../src/services/market-data/marketDataService.js';
import { silentLogger } from '../../src/utils/logger.js';
import { TEST_PASSWORD, fastHasher } from '../support/authKit.js';

const terms = {
  underlying: { symbol: '^NSEI', assetClass: 'index' },
  notional: 1_000_000,
  tenorDays: 182,
  strikePct: 100,
  couponPct: 9.5,
  barrierPct: 80,
  barrierType: 'European',
};
const profile = {
  riskAppetite: 'medium',
  horizonMonths: 12,
  lossTolerancePct: 10,
  concentrationPct: 15,
};

export function runAccountsFlow(opts: { url: string; key: string; reset: () => Promise<void> }) {
  it('links runs to accounts and feeds the admin console, on a real database', async () => {
    await opts.reset();
    const config = buildConfig(
      parseEnv({
        SUPABASE_URL: opts.url,
        SUPABASE_SERVICE_ROLE_KEY: opts.key,
        AUTH_JWT_SECRET: 'x'.repeat(40),
        AUTH_ENFORCED: 'true',
        AUTH_COOKIE_SECURE: 'false',
      }),
    );
    const db = createSupabaseClient(config.database);
    const repositories = createSupabaseRepositories(db);
    const app = createApp(config, silentLogger, {
      marketData: createMarketDataService({}),
      repositories,
      passwordHasher: fastHasher,
    });

    // Two users register through the real endpoint; the admin is seeded, as `npm run seed:admin` does.
    const register = async (email: string, displayName: string) => {
      const agent = request.agent(app);
      const res = await agent
        .post('/api/auth/register')
        .send({ email, password: TEST_PASSWORD, displayName });
      expect(res.status, res.text).toBe(201);
      return agent;
    };
    const asha = await register('asha@bank.test', 'Asha Rao');
    const ravi = await register('ravi@bank.test', 'Ravi Menon');
    await repositories.users.create({
      email: 'boss@bank.test',
      displayName: 'Administrator',
      passwordHash: await fastHasher.hash(TEST_PASSWORD),
      role: 'ADMIN',
    });
    const admin = request.agent(app);
    expect(
      (
        await admin
          .post('/api/auth/login')
          .send({ email: 'boss@bank.test', password: TEST_PASSWORD })
      ).status,
    ).toBe(200);
    // A failed sign-in, for the log.
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@bank.test', password: 'Wrong-Passw0rd' });

    const runAndAssess = async (agent: ReturnType<typeof request.agent>, shockPct: number) => {
      const sim = await agent.post('/api/simulate').send({
        mode: 'B',
        productType: 'ELN',
        terms,
        shockPct,
        level: { source: 'manual', value: 25_000 },
      });
      expect(sim.status, sim.text).toBe(200);
      const simulationId = (sim.body as { simulationId: string }).simulationId;
      const verdict = await agent.post('/api/suitability').send({ simulationId, profile });
      expect(verdict.status, verdict.text).toBe(200);
      expect((verdict.body as { persisted: boolean }).persisted).toBe(true);
      return simulationId;
    };
    const ashaRun = await runAndAssess(asha, -10);
    await runAndAssess(asha, 15);
    await runAndAssess(ravi, -30);

    // Each account lists only its own runs, with the terms and verdict that were stored.
    const mine = (await asha.get('/api/runs')).body as SavedRunsResponse;
    expect(mine.runs).toHaveLength(2);
    expect(mine.runs.every((r) => r.user?.email === 'asha@bank.test')).toBe(true);
    expect(mine.runs[0]).toMatchObject({
      productType: 'ELN',
      terms: { strikePct: 100, barrierPct: 80 },
      inputs: { levelValue: 25_000, levelSource: 'manual' },
    });
    expect(mine.runs[0]!.verdict).not.toBeNull();
    expect(((await ravi.get('/api/runs')).body as SavedRunsResponse).runs).toHaveLength(1);

    // Another account cannot use a run it does not own, and nothing was written for it.
    const stolen = await ravi.post('/api/suitability').send({ simulationId: ashaRun, profile });
    expect(stolen.status).toBe(404);
    expect(((await ravi.get('/api/runs')).body as SavedRunsResponse).runs).toHaveLength(1);

    // The admin sees everyone's runs with their owners; a user may not.
    const all = (await admin.get('/api/audit/simulations')).body as AuditSimulationsResponse;
    expect(all.simulations.map((s) => s.user?.email).sort()).toEqual([
      'asha@bank.test',
      'asha@bank.test',
      'ravi@bank.test',
    ]);
    expect((await asha.get('/api/audit/simulations')).status).toBe(403);
    expect((await asha.get('/api/admin/analytics')).status).toBe(403);

    // One saved run, in full: the owner and the admin can open it; another account cannot.
    const listed = mine.runs[0]!;
    const opened = await asha.get(`/api/runs/${listed.id}`);
    expect(opened.status, opened.text).toBe(200);
    const detail = (opened.body as SavedRunResponse).run;
    expect(detail).toMatchObject({
      id: listed.id,
      user: { email: 'asha@bank.test' },
      client: profile,
      verdict: listed.verdict,
      distribution: null,
      forecast: null,
      explanations: [],
    });
    expect(detail.cases).toEqual([
      expect.objectContaining({
        scenario: 'shock',
        percentile: null,
        payoff: listed.results[0]!.payoff,
      }),
    ]);
    expect(detail.rulesVersion).toEqual(expect.any(String));
    expect(detail.assessedAt).toEqual(expect.any(String));
    expect((await ravi.get(`/api/runs/${listed.id}`)).status).toBe(404);
    expect((await ravi.get('/api/runs/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    const adminView = await admin.get(`/api/audit/simulations/${listed.id}`);
    expect(adminView.status, adminView.text).toBe(200);
    expect((adminView.body as SavedRunResponse).run).toEqual(detail);
    expect((await asha.get(`/api/audit/simulations/${listed.id}`)).status).toBe(403);

    // Analytics computed from the real rows.
    const a = (await admin.get('/api/admin/analytics')).body as AdminAnalytics;
    expect(a.totals).toMatchObject({
      users: 3,
      activeUsers: 3,
      admins: 1,
      runsAllTime: 3,
      runsInWindow: 3,
      loginsLast7Days: 1,
      failedLoginsLast7Days: 1,
    });
    expect(a.daily).toHaveLength(30);
    expect(a.daily[29]!.runs).toBe(3);
    expect(a.byProduct).toEqual([{ product: 'ELN', runs: 3 }]);
    expect(a.topUsers.map((u) => [u.user.email, u.runs])).toEqual([
      ['asha@bank.test', 2],
      ['ravi@bank.test', 1],
    ]);

    // The activity log, written by the API, read back through the real adapter.
    const log = (await admin.get('/api/admin/activity')).body as ActivityResponse;
    const count = (event: string) => log.events.filter((e) => e.event === event).length;
    expect(count('REGISTER')).toBe(2);
    expect(count('LOGIN')).toBe(1);
    expect(count('LOGIN_FAILED')).toBe(1);
    expect(count('RUN_SAVED')).toBe(3);
    expect(log.events.find((e) => e.event === 'LOGIN_FAILED')).toMatchObject({
      user: null,
      actorEmail: 'ghost@bank.test',
      detail: { reason: 'unknown_email' },
    });
    expect(JSON.stringify(log)).not.toMatch(/Wrong-Passw0rd|scrypt|token/i);

    // The database itself enforces the rules the app relies on.
    const ashaUser = await repositories.users.getByEmail('asha@bank.test');
    const delUser = await db.from('app_users').delete().eq('id', ashaUser!.id);
    expect(delUser.error?.code).toBe('23503'); // an account with saved runs cannot be deleted
    const badRole = await db
      .from('app_users')
      .update({ role: 'COMPLIANCE' })
      .eq('id', ashaUser!.id);
    expect(badRole.error?.code).toBe('22P02'); // the Compliance role no longer exists
    const badEvent = await db
      .from('activity_events')
      .insert({ event: 'SOMETHING_ELSE', detail: {} });
    expect(badEvent.error?.code).toBe('23514'); // only the known event names are accepted
  });
}
