// Runs belong to the account that ran them; a user sees their own, the admin sees everyone's and
// the activity and analytics behind the admin console. Real HTTP, in-memory repositories.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  type ActivityResponse,
  type AdminAnalytics,
  type AuditSimulationsResponse,
  type SavedRunResponse,
  type SavedRunsResponse,
} from '@mindspark/shared';
import { TEST_PASSWORD } from '../support/authKit.js';
import { createAuthApp } from '../support/authApp.js';
import { createMemorySimulationRecords } from '../../src/services/simulation/simulationRecords.js';
import { bodyOf, errorBody } from '../helpers/http.js';

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

type Agent = Awaited<ReturnType<ReturnType<typeof createAuthApp>['signedIn']>>;

/** Runs a Mode B simulation and asks for its verdict, as the web app does. */
async function runAndAssess(agent: Agent, shockPct = -10): Promise<string> {
  const sim = await agent.post('/api/simulate').send({
    mode: 'B',
    productType: 'ELN',
    terms,
    shockPct,
    level: { source: 'manual', value: 25_000 },
  });
  expect(sim.status).toBe(200);
  const simulationId = (sim.body as { simulationId: string }).simulationId;
  const verdict = await agent.post('/api/suitability').send({ simulationId, profile });
  expect(verdict.status).toBe(200);
  return simulationId;
}

describe('saved runs belong to the account that ran them', () => {
  it("lists a user their own runs, with the terms and verdict, and nobody else's", async () => {
    const { signedIn } = createAuthApp();
    const asha = await signedIn('RM', 'asha@bank.test');
    const ravi = await signedIn('RM', 'ravi@bank.test');
    await runAndAssess(asha);
    await runAndAssess(asha, 15);
    await runAndAssess(ravi);

    const mine = bodyOf<SavedRunsResponse>(await asha.get('/api/runs')).runs;
    expect(mine).toHaveLength(2);
    expect(mine.every((r) => r.user?.email === 'asha@bank.test')).toBe(true);
    expect(mine[0]).toMatchObject({
      mode: 'B',
      productType: 'ELN',
      underlyingSymbol: '^NSEI',
      notional: 1_000_000,
      terms: { strikePct: 100, barrierPct: 80 },
      inputs: { levelValue: 25_000, levelSource: 'manual', shockPct: 15 },
    });
    expect(mine[0]!.verdict).not.toBeNull();
    expect(bodyOf<SavedRunsResponse>(await ravi.get('/api/runs')).runs).toHaveLength(1);
    expect(bodyOf<SavedRunsResponse>(await asha.get('/api/runs?limit=1')).runs).toHaveLength(1);
  });

  it('needs a signed-in account and a valid limit', async () => {
    const { app, signedIn } = createAuthApp();
    expect((await request(app).get('/api/runs')).status).toBe(401);
    const asha = await signedIn('RM');
    expect((await asha.get('/api/runs?limit=0')).status).toBe(400);
  });

  it("will not let another account use someone else's run", async () => {
    const { signedIn } = createAuthApp();
    const asha = await signedIn('RM', 'asha@bank.test');
    const ravi = await signedIn('RM', 'ravi@bank.test');
    const simulationId = await runAndAssess(asha);

    // Ravi knows Asha's run id, but to the API it does not exist for him.
    const res = await ravi.post('/api/suitability').send({ simulationId, profile });
    expect(res.status).toBe(404);
    expect(errorBody(res).code).toBe('NOT_FOUND');
    // Nothing was written for Ravi.
    expect(bodyOf<SavedRunsResponse>(await ravi.get('/api/runs')).runs).toHaveLength(0);
  });

  it("shows the admin everyone's runs, each with its owner, but gives them to no user", async () => {
    const { signedIn } = createAuthApp();
    const asha = await signedIn('RM', 'asha@bank.test');
    const ravi = await signedIn('RM', 'ravi@bank.test');
    const admin = await signedIn('ADMIN');
    await runAndAssess(asha);
    await runAndAssess(ravi);

    const all = bodyOf<AuditSimulationsResponse>(await admin.get('/api/audit/simulations'));
    expect(all.simulations.map((s) => s.user?.email).sort()).toEqual([
      'asha@bank.test',
      'ravi@bank.test',
    ]);
    expect((await asha.get('/api/audit/simulations')).status).toBe(403);
  });
});

describe('opening one saved run', () => {
  it('gives a user the full record of their own run', async () => {
    const { signedIn } = createAuthApp();
    const asha = await signedIn('RM', 'asha@bank.test');
    await runAndAssess(asha);
    const [listed] = bodyOf<SavedRunsResponse>(await asha.get('/api/runs')).runs;

    const res = await asha.get(`/api/runs/${listed!.id}`);
    expect(res.status).toBe(200);
    const { run } = bodyOf<SavedRunResponse>(res);
    expect(run).toMatchObject({
      id: listed!.id,
      user: { email: 'asha@bank.test' },
      mode: 'B',
      productType: 'ELN',
      inputs: { levelValue: 25_000, shockPct: -10 },
      client: profile,
      distribution: null,
      forecast: null,
      levelAsOf: null,
      verdict: listed!.verdict,
      explanations: [],
    });
    expect(run.cases).toHaveLength(1);
    expect(run.cases[0]).toMatchObject({ scenario: 'shock', terminal: 22_500, percentile: null });
    expect(run.cases[0]!.payoff).toBe(listed!.results[0]!.payoff);
    expect(run.rulesVersion).toEqual(expect.any(String));
    expect(run.assessedAt).toEqual(expect.any(String));
  });

  it("answers another account's run, a missing run and a malformed id the same way", async () => {
    const { signedIn } = createAuthApp();
    const asha = await signedIn('RM', 'asha@bank.test');
    const ravi = await signedIn('RM', 'ravi@bank.test');
    await runAndAssess(asha);
    const [listed] = bodyOf<SavedRunsResponse>(await asha.get('/api/runs')).runs;

    for (const id of [listed!.id, '00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const res = await ravi.get(`/api/runs/${id}`);
      expect(res.status, id).toBe(404);
      expect(errorBody(res)).toMatchObject({ code: 'NOT_FOUND', message: 'Saved run not found' });
    }
  });

  it('lets the admin open any run, and nobody else use the admin route', async () => {
    const { app, signedIn } = createAuthApp();
    const asha = await signedIn('RM', 'asha@bank.test');
    const admin = await signedIn('ADMIN');
    await runAndAssess(asha);
    const [listed] = bodyOf<SavedRunsResponse>(await asha.get('/api/runs')).runs;
    const path = `/api/audit/simulations/${listed!.id}`;

    const res = await admin.get(path);
    expect(res.status).toBe(200);
    expect(bodyOf<SavedRunResponse>(res).run).toMatchObject({
      id: listed!.id,
      user: { email: 'asha@bank.test' },
    });
    expect((await asha.get(path)).status).toBe(403);
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).get(`/api/runs/${listed!.id}`)).status).toBe(401);
    expect((await admin.get('/api/audit/simulations/not-a-uuid')).status).toBe(404);
  });
});

describe('activity log and analytics (admin only)', () => {
  it('records sign-ins, failed sign-ins and saved runs without any secret', async () => {
    const { app, signedIn } = createAuthApp();
    const asha = await signedIn('RM', 'asha@bank.test');
    const admin = await signedIn('ADMIN');
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'asha@bank.test', password: 'Wrong-Passw0rd' });
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@bank.test', password: 'Wrong-Passw0rd' });
    await runAndAssess(asha);

    const res = await admin.get('/api/admin/activity');
    expect(res.status).toBe(200);
    const { events } = bodyOf<ActivityResponse>(res);
    const names = events.map((e) => e.event);
    expect(names).toEqual(expect.arrayContaining(['LOGIN', 'LOGIN_FAILED', 'RUN_SAVED']));
    expect(
      events.find((e) => e.event === 'LOGIN_FAILED' && e.actorEmail === 'ghost@bank.test'),
    ).toMatchObject({ user: null, detail: { reason: 'unknown_email' } });
    expect(events.find((e) => e.event === 'RUN_SAVED')).toMatchObject({
      user: { email: 'asha@bank.test' },
      detail: { product: 'ELN', mode: 'B' },
    });
    expect(JSON.stringify(res.body)).not.toContain(TEST_PASSWORD);
    expect(JSON.stringify(res.body)).not.toMatch(/Wrong-Passw0rd|scrypt|token/i);
  });

  it('logs account changes made by the admin', async () => {
    const { signedIn, kit } = createAuthApp();
    const admin = await signedIn('ADMIN');
    const target = await kit.seedUser('RM', 'target@bank.test');
    await admin.put(`/api/admin/users/${target.id}`).send({ role: 'ADMIN' });
    await admin.put(`/api/admin/users/${target.id}`).send({ active: false });
    const { events } = bodyOf<ActivityResponse>(await admin.get('/api/admin/activity'));
    expect(events.map((e) => e.event)).toEqual(
      expect.arrayContaining(['ROLE_CHANGED', 'USER_DEACTIVATED']),
    );
    expect(events.find((e) => e.event === 'ROLE_CHANGED')?.detail).toMatchObject({
      from: 'RM',
      to: 'ADMIN',
    });
  });

  it('summarises accounts, runs per day, products, verdicts and the busiest users', async () => {
    const { signedIn } = createAuthApp();
    const asha = await signedIn('RM', 'asha@bank.test');
    const ravi = await signedIn('RM', 'ravi@bank.test');
    const admin = await signedIn('ADMIN');
    await runAndAssess(asha);
    await runAndAssess(asha, 15);
    await runAndAssess(ravi);

    const res = await admin.get('/api/admin/analytics');
    expect(res.status).toBe(200);
    const a = bodyOf<AdminAnalytics>(res);
    expect(a.totals).toMatchObject({
      users: 3,
      activeUsers: 3,
      admins: 1,
      runsAllTime: 3,
      runsInWindow: 3,
      runsLast7Days: 3,
      loginsLast7Days: 3,
    });
    expect(a.windowDays).toBe(30);
    expect(a.daily).toHaveLength(30);
    expect(a.daily.reduce((n, d) => n + d.runs, 0)).toBe(3);
    expect(a.daily[29]!.runs).toBe(3); // today is the last bar
    expect(a.byProduct).toEqual([{ product: 'ELN', runs: 3 }]);
    expect(a.byMode).toEqual([{ mode: 'B', runs: 3 }]);
    expect(a.verdicts.reduce((n, v) => n + v.count, 0)).toBe(3);
    expect(a.topUsers.map((u) => [u.user.email, u.runs])).toEqual([
      ['asha@bank.test', 2],
      ['ravi@bank.test', 1],
    ]);
    expect(a.truncated).toBe(false);
  });

  it('is closed to users and to anyone not signed in', async () => {
    const { app, signedIn } = createAuthApp();
    const asha = await signedIn('RM');
    for (const path of ['/api/admin/analytics', '/api/admin/activity']) {
      expect((await asha.get(path)).status, path).toBe(403);
      expect((await request(app).get(path)).status, path).toBe(401);
    }
    const admin = await signedIn('ADMIN');
    expect((await admin.get('/api/admin/activity?limit=0')).status).toBe(400);
  });
});

describe('the run store', () => {
  it('reports a run as unknown to anyone but its owner', () => {
    const records = createMemorySimulationRecords();
    records.save({
      id: 'run-1',
      createdAt: Date.now(),
      ownerId: 'user-a',
      request: {} as never,
      response: {} as never,
    });
    expect(records.get('run-1', 'user-a').id).toBe('run-1');
    expect(() => records.get('run-1', 'user-b')).toThrow(/Unknown or expired/);
    expect(() => records.get('run-1')).toThrow(/Unknown or expired/);
  });

  it('does not lose a run when another account asks for it', () => {
    const records = createMemorySimulationRecords();
    records.save({
      id: 'run-1',
      createdAt: Date.now(),
      ownerId: 'user-a',
      request: {} as never,
      response: {} as never,
    });
    expect(() => records.get('run-1', 'user-b')).toThrow();
    expect(records.get('run-1', 'user-a').id).toBe('run-1');
    expect(records.update('run-1', { createdAt: Date.now() }).ownerId).toBe('user-a');
  });
});
