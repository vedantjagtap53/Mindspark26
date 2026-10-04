// Persistence through the real app with the test-only in-memory repositories, and
// /api/client-profiles. The Firebase adapter itself is covered by the contract suite on the emulator.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { SavedProfile, SuitabilityResponse } from '@mindspark/shared';
import { createApp } from '../../src/app.js';
import { parseEnv } from '../../src/config/env.js';
import { buildConfig } from '../../src/config/index.js';
import { RepositoryError, type Repositories } from '../../src/repositories/interfaces/index.js';
import type { RagClient } from '../../src/services/ai/ragClient.js';
import { createMarketDataService } from '../../src/services/market-data/marketDataService.js';
import { silentLogger } from '../../src/utils/logger.js';
import { createMemoryRepositories } from '../support/memoryRepositories.js';
import { errorBody } from '../helpers/http.js';

const rag: RagClient = {
  explain: (ctx) =>
    Promise.resolve({
      simulation_id: ctx.simulation_id,
      verdict: ctx.suitability.verdict,
      sections: {
        what_it_is: 'a',
        best_case: 'b',
        worst_case: 'c',
        loss_triggers: 'd',
        suitability_reasoning: 'e',
      },
      risk_notice: 'Scenario simulation, not a guarantee.',
      checks_passed: true,
      ungrounded_numbers: [],
      guardrail_violations: [],
      sources: ['eln.md'],
      model_name: 'fake-llm',
    }),
  chat: () => Promise.reject(new Error('unused')),
};

const appWith = (repositories: Repositories | undefined) =>
  createApp(buildConfig(parseEnv({})), silentLogger, {
    marketData: createMarketDataService({}),
    rag,
    repositories,
  });

const eln = {
  underlying: { symbol: '^NSEI', assetClass: 'index' },
  notional: 1_000_000,
  tenorDays: 365,
  strikePct: 100,
  couponPct: 10,
  barrierPct: 80,
  barrierType: 'European',
};
const profile = {
  riskAppetite: 'high',
  horizonMonths: 24,
  lossTolerancePct: 50,
  concentrationPct: 10,
};
const saved = { clientRef: 'CL-0042', label: 'Retirement', ...profile };

async function simulate(app: ReturnType<typeof appWith>): Promise<string> {
  const res = await request(app)
    .post('/api/simulate')
    .send({
      mode: 'B',
      productType: 'ELN',
      terms: eln,
      shockPct: -10,
      level: { source: 'manual', value: 25_000 },
    });
  expect(res.status).toBe(200);
  return (res.body as { simulationId: string }).simulationId;
}

describe('/api/client-profiles', () => {
  it('creates, reads, lists and replaces a saved profile', async () => {
    const app = appWith(createMemoryRepositories());
    const created = await request(app).post('/api/client-profiles').send(saved);
    expect(created.status).toBe(201);
    const p = created.body as SavedProfile;
    expect(p).toMatchObject({ clientRef: 'CL-0042', label: 'Retirement', riskAppetite: 'high' });

    const list = await request(app).get('/api/client-profiles');
    expect((list.body as { profiles: SavedProfile[] }).profiles.map((x) => x.id)).toEqual([p.id]);

    const updated = await request(app)
      .put(`/api/client-profiles/${p.id}`)
      .send({ ...saved, lossTolerancePct: 20 });
    expect(updated.status).toBe(200);
    expect((updated.body as SavedProfile).lossTolerancePct).toBe(20);
    const got = await request(app).get(`/api/client-profiles/${p.id}`);
    expect((got.body as SavedProfile).lossTolerancePct).toBe(20);
  });

  it('validates input, rejects duplicates and unknown ids', async () => {
    const app = appWith(createMemoryRepositories());
    const bad = await request(app)
      .post('/api/client-profiles')
      .send({ ...saved, lossTolerancePct: 150 });
    expect(bad.status).toBe(400);
    const name = await request(app)
      .post('/api/client-profiles')
      .send({ ...saved, fullName: 'x' });
    expect(name.status).toBe(400);

    await request(app).post('/api/client-profiles').send(saved);
    const dup = await request(app).post('/api/client-profiles').send(saved);
    expect(dup.status).toBe(409);
    expect(errorBody(dup).code).toBe('CONFLICT');

    const unknown = await request(app).get(
      '/api/client-profiles/6f1c1f5e-3b0a-4a76-9b2c-1d2e3f4a5b6c',
    );
    expect(unknown.status).toBe(404);
    const badId = await request(app).get('/api/client-profiles/nope');
    expect(badId.status).toBe(400);
  });

  it('says so when the database is not configured', async () => {
    const res = await request(appWith(undefined)).get('/api/client-profiles');
    expect(res.status).toBe(503);
    expect(errorBody(res).code).toBe('DATABASE_NOT_CONFIGURED');
  });
});

describe('persistence of simulation, verdict and explanation', () => {
  it('writes the audit record linked to the saved profile, with a frozen snapshot', async () => {
    const repos = createMemoryRepositories();
    const app = appWith(repos);
    const profileId = (
      (await request(app).post('/api/client-profiles').send(saved)).body as SavedProfile
    ).id;
    const simulationId = await simulate(app);

    const suit = await request(app)
      .post('/api/suitability')
      .send({ simulationId, profile, profileId });
    expect(suit.status).toBe(200);
    const body = suit.body as SuitabilityResponse;
    expect(body.persisted).toBe(true);

    const [summary] = await repos.simulations.listForProfile(profileId, 10);
    expect(summary).toMatchObject({ mode: 'B', productType: 'ELN', verdict: body.verdict });
    const record = await repos.simulations.getById(summary!.id);
    expect(record).toMatchObject({
      mode: 'B',
      shockPct: -10,
      levelSource: 'manual',
      profileSnapshot: { clientRef: 'CL-0042', riskAppetite: 'high', lossTolerancePct: 50 },
      suitability: { verdict: body.verdict, rulesVersion: expect.any(String) as unknown },
    });
    expect(record!.riskResults).toHaveLength(1);
    expect(record!.configuration.terms).toMatchObject({ barrierPct: 80 });

    // Editing the profile later does not change the evidence.
    await request(app)
      .put(`/api/client-profiles/${profileId}`)
      .send({ ...saved, lossTolerancePct: 1 });
    const again = await repos.simulations.getById(summary!.id);
    expect(again!.profileSnapshot?.lossTolerancePct).toBe(50);

    await request(app).post('/api/explain').send({ simulationId });
    expect((await repos.simulations.getById(summary!.id))!.explanations).toHaveLength(1);
  });

  it('stores an ad hoc profile as a snapshot only', async () => {
    const repos = createMemoryRepositories();
    const app = appWith(repos);
    const simulationId = await simulate(app);
    const res = await request(app).post('/api/suitability').send({ simulationId, profile });
    expect((res.body as SuitabilityResponse).persisted).toBe(true);
  });

  it('does not persist, and says so, without a database', async () => {
    const app = appWith(undefined);
    const simulationId = await simulate(app);
    const res = await request(app).post('/api/suitability').send({ simulationId, profile });
    expect(res.status).toBe(200);
    expect((res.body as SuitabilityResponse).persisted).toBe(false);
  });

  it('fails with DATABASE_ERROR instead of writing anywhere else when the database is down', async () => {
    const repos = createMemoryRepositories();
    repos.productConfigurations.create = () =>
      Promise.reject(new RepositoryError('unavailable', 'Firebase SQL Connect is unreachable'));
    const app = appWith(repos);
    const simulationId = await simulate(app);
    const res = await request(app).post('/api/suitability').send({ simulationId, profile });
    expect(res.status).toBe(500);
    expect(errorBody(res).code).toBe('DATABASE_ERROR');
  });

  it('rejects an unknown saved profile id', async () => {
    const app = appWith(createMemoryRepositories());
    const simulationId = await simulate(app);
    const res = await request(app)
      .post('/api/suitability')
      .send({ simulationId, profile, profileId: '6f1c1f5e-3b0a-4a76-9b2c-1d2e3f4a5b6c' });
    expect(res.status).toBe(404);
  });
});
