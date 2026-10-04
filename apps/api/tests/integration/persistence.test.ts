// Persistence through the real app with the test-only in-memory repositories. The Supabase adapter
// itself is covered by the contract suite in tests/supabase.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { SuitabilityResponse } from '@mindspark/shared';
import { createApp } from '../../src/app.js';
import { parseEnv } from '../../src/config/env.js';
import { buildConfig } from '../../src/config/index.js';
import { RepositoryError, type Repositories } from '../../src/repositories/interfaces/index.js';
import type { RagClient } from '../../src/services/ai/ragClient.js';
import { createMarketDataService } from '../../src/services/market-data/marketDataService.js';
import { silentLogger } from '../../src/utils/logger.js';
import { createMemoryRepositories } from '../support/memoryRepositories.js';
import { errorBody } from '../helpers/http.js';

/** Every context the explain stub received, to check what would be sent to the AI service. */
const explainContexts: unknown[] = [];

const rag: RagClient = {
  explain: (ctx) => {
    explainContexts.push(ctx);
    return Promise.resolve({
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
    });
  },
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
  name: 'Asha Rao',
  age: 52,
  riskAppetite: 'high',
  horizonMonths: 24,
  lossTolerancePct: 50,
  concentrationPct: 10,
};

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

/** Memory repositories that remember the id of each simulation row written. */
function trackedRepositories() {
  const repos = createMemoryRepositories();
  const ids: string[] = [];
  const record = repos.simulations.record.bind(repos.simulations);
  repos.simulations.record = async (input) => {
    const id = await record(input);
    ids.push(id);
    return id;
  };
  return { repos, ids };
}

describe('client profile on /api/suitability', () => {
  it('requires a name and an age within range', async () => {
    const app = appWith(createMemoryRepositories());
    const simulationId = await simulate(app);
    const send = (p: Record<string, unknown>) =>
      request(app).post('/api/suitability').send({ simulationId, profile: p });

    const { name: _name, ...noName } = profile;
    const { age: _age, ...noAge } = profile;
    for (const bad of [
      noName,
      noAge,
      { ...profile, name: '   ' },
      { ...profile, name: 'x'.repeat(121) },
      { ...profile, age: 17 },
      { ...profile, age: 121 },
      { ...profile, age: 52.5 },
    ]) {
      const res = await send(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(errorBody(res).code).toBe('VALIDATION_ERROR');
    }
    expect((await send(profile)).status).toBe(200);
  });

  it('gives the same verdict whatever the name and age are', async () => {
    const app = appWith(undefined);
    const simulationId = await simulate(app);
    const verdictFor = async (p: object) =>
      (await request(app).post('/api/suitability').send({ simulationId, profile: p })).body as {
        verdict: string;
        flags: unknown;
      };
    const a = await verdictFor(profile);
    const b = await verdictFor({ ...profile, name: 'Someone Else', age: 90 });
    expect(b).toEqual(a);
  });
});

describe('persistence of simulation, verdict and explanation', () => {
  it('writes the audit record with the client as entered, name and age included', async () => {
    const { repos, ids } = trackedRepositories();
    const app = appWith(repos);
    const simulationId = await simulate(app);

    const suit = await request(app).post('/api/suitability').send({ simulationId, profile });
    expect(suit.status).toBe(200);
    const body = suit.body as SuitabilityResponse;
    expect(body.persisted).toBe(true);

    expect(ids).toHaveLength(1);
    const record = await repos.simulations.getById(ids[0]!);
    expect(record).toMatchObject({
      mode: 'B',
      shockPct: -10,
      levelSource: 'manual',
      profileSnapshot: profile,
      suitability: { verdict: body.verdict, rulesVersion: expect.any(String) as unknown },
    });
    expect(record!.riskResults).toHaveLength(1);
    expect(record!.configuration.terms).toMatchObject({ barrierPct: 80 });

    await request(app).post('/api/explain').send({ simulationId });
    expect((await repos.simulations.getById(ids[0]!))!.explanations).toHaveLength(1);
  });

  it('writes another record when the same run is assessed for another client', async () => {
    const { repos, ids } = trackedRepositories();
    const app = appWith(repos);
    const simulationId = await simulate(app);
    await request(app).post('/api/suitability').send({ simulationId, profile });
    await request(app)
      .post('/api/suitability')
      .send({ simulationId, profile: { ...profile, name: 'Ravi Menon', age: 61 } });
    expect(ids).toHaveLength(2);
    expect((await repos.simulations.getById(ids[1]!))!.profileSnapshot).toMatchObject({
      name: 'Ravi Menon',
      age: 61,
    });
    // One configuration is reused across both assessments of the run.
    const [first, second] = await Promise.all(ids.map((id) => repos.simulations.getById(id)));
    expect(first!.configuration.id).toBe(second!.configuration.id);
  });

  it('never sends the name or age to the AI service', async () => {
    const app = appWith(createMemoryRepositories());
    const simulationId = await simulate(app);
    await request(app).post('/api/suitability').send({ simulationId, profile });
    explainContexts.length = 0;
    const res = await request(app).post('/api/explain').send({ simulationId });
    expect(res.status).toBe(200);
    expect(explainContexts).toHaveLength(1);
    const sent = JSON.stringify(explainContexts[0]);
    expect(sent).not.toContain('Asha');
    expect(sent).not.toMatch(/"age"|"name"/);
    expect(explainContexts[0]).toMatchObject({
      profile: { risk_appetite: 'high', loss_tolerance_pct: 50, concentration_pct: 10 },
    });
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
      Promise.reject(new RepositoryError('unavailable', 'Supabase is unreachable'));
    const app = appWith(repos);
    const simulationId = await simulate(app);
    const res = await request(app).post('/api/suitability').send({ simulationId, profile });
    expect(res.status).toBe(500);
    expect(errorBody(res).code).toBe('DATABASE_ERROR');
  });
});
