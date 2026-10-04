// simulate → suitability → explain → chat through the real app, with the AI service faked.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type {
  ChatResponse,
  ExplainResponse,
  SimulateModeBResponse,
  SuitabilityResponse,
} from '@mindspark/shared';
import { createApp } from '../../src/app.js';
import { buildConfig } from '../../src/config/index.js';
import { parseEnv } from '../../src/config/env.js';
import type { RagClient } from '../../src/services/ai/ragClient.js';
import type { RagSimulationContext } from '../../src/services/ai/simulationContext.js';
import { createMarketDataService } from '../../src/services/market-data/marketDataService.js';
import { silentLogger } from '../../src/utils/logger.js';

function fakeRag(opts: { verdict?: 'Suitable' | 'Caution' | 'Not suitable' } = {}) {
  const contexts: RagSimulationContext[] = [];
  const questions: Array<{ question: string; history: unknown[] }> = [];
  const rag: RagClient = {
    explain: (ctx) => {
      contexts.push(ctx);
      return Promise.resolve({
        simulation_id: ctx.simulation_id,
        verdict: opts.verdict ?? ctx.suitability.verdict,
        sections: {
          what_it_is: 'An equity linked note pays a coupon.',
          best_case: 'The best case returns the notional plus the coupon.',
          worst_case: 'The worst case shown loses part of the notional.',
          loss_triggers: 'A fall below the barrier at maturity causes a loss.',
          suitability_reasoning: 'The verdict follows the flags raised.',
        },
        risk_notice: 'Scenario simulation, not a guarantee.',
        checks_passed: true,
        ungrounded_numbers: [],
        guardrail_violations: [],
        sources: ['eln.md'],
        model_name: 'fake-llm',
      });
    },
    chat: (ctx, question, history) => {
      contexts.push(ctx);
      questions.push({ question, history });
      return Promise.resolve({
        simulation_id: ctx.simulation_id,
        answer: 'The barrier is 80% of the starting level.',
        scope: 'in_scope',
        checks_passed: true,
        risk_note: 'Scenario simulation, not a guarantee.',
        ungrounded_numbers: [],
        guardrail_violations: [],
        sources: ['eln.md'],
        model_name: 'fake-llm',
      });
    },
  };
  return { rag, contexts, questions };
}

const appWith = (rag: RagClient | undefined) =>
  createApp(buildConfig(parseEnv({})), silentLogger, {
    marketData: createMarketDataService({}),
    rag,
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
  lossTolerancePct: 10,
  concentrationPct: 10,
};
const history = [
  { role: 'user', content: 'Hi' },
  { role: 'assistant', content: 'Hello' },
];

async function simulate(app: ReturnType<typeof appWith>) {
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
  return res.body as SimulateModeBResponse;
}

const errorCode = (body: unknown) => (body as { error: { code: string } }).error.code;

describe('suitability, explain and chat', () => {
  it('runs the full flow from the backend’s own numbers', async () => {
    const fake = fakeRag();
    const app = appWith(fake.rag);
    const sim = await simulate(app);
    expect(typeof sim.simulationId).toBe('string');

    const suit = await request(app)
      .post('/api/suitability')
      .send({ simulationId: sim.simulationId, profile });
    expect(suit.status).toBe(200);
    const s = suit.body as SuitabilityResponse;
    // Mode B low case = worst of the scenario shocks and the RM's shock: the −25% scenario.
    expect(s.lowCase.label).toBe('-25% shock');
    expect(s.lowCase.returnPct).toBeLessThan(-10);
    expect(s.verdict).toBe('Not suitable');
    expect(s.flags.map((f) => f.rule)).toEqual(['low_case_loss', 'barrier_knock_in']);

    const explained = await request(app)
      .post('/api/explain')
      .send({ simulationId: sim.simulationId });
    expect(explained.status).toBe(200);
    const e = explained.body as ExplainResponse;
    expect(e.verdict).toBe('Not suitable');
    expect(e.sections.lossTriggers).toContain('barrier');

    const ctx = fake.contexts[0]!;
    expect(ctx).toMatchObject({
      simulation_id: sim.simulationId,
      mode: 'B',
      currency: 'INR',
      terms: { product: 'ELN', barrier_pct: 80, barrier_type: 'european', coupon_pct_pa: 10 },
      profile: { risk_appetite: 'high', investment_horizon_days: 730, loss_tolerance_pct: 10 },
      suitability: { verdict: 'Not suitable' },
    });
    expect(ctx.distribution).toBeUndefined();
    expect(ctx.cases.map((c) => c.label)).toEqual(['-25%', '-10%', '0%', '+15%']);

    const chat = await request(app)
      .post('/api/chat')
      .send({ simulationId: sim.simulationId, question: 'Where is the barrier?', history });
    expect(chat.status).toBe(200);
    expect((chat.body as ChatResponse).answer).toContain('barrier');
    expect(fake.questions[0]).toEqual({ question: 'Where is the barrier?', history });
  });

  it('requires the suitability check before explaining', async () => {
    const app = appWith(fakeRag().rag);
    const sim = await simulate(app);
    const res = await request(app).post('/api/explain').send({ simulationId: sim.simulationId });
    expect(res.status).toBe(400);
    expect(errorCode(res.body)).toBe('VALIDATION_ERROR');
  });

  it('rejects an explanation that names a different verdict', async () => {
    const app = appWith(fakeRag({ verdict: 'Suitable' }).rag);
    const sim = await simulate(app);
    await request(app).post('/api/suitability').send({ simulationId: sim.simulationId, profile });
    const res = await request(app).post('/api/explain').send({ simulationId: sim.simulationId });
    expect(res.status).toBe(502);
    expect(errorCode(res.body)).toBe('AI_INVALID_RESPONSE');
  });

  it('reports a missing AI service and unknown simulations clearly', async () => {
    const app = appWith(undefined);
    const sim = await simulate(app);
    await request(app).post('/api/suitability').send({ simulationId: sim.simulationId, profile });
    const noAi = await request(app).post('/api/explain').send({ simulationId: sim.simulationId });
    expect(noAi.status).toBe(503);
    expect(errorCode(noAi.body)).toBe('AI_UNAVAILABLE');

    const unknown = await request(app)
      .post('/api/suitability')
      .send({ simulationId: 'nope', profile });
    expect(unknown.status).toBe(404);
  });

  it('validates the profile and the chat question', async () => {
    const app = appWith(fakeRag().rag);
    const sim = await simulate(app);
    const badProfile = await request(app)
      .post('/api/suitability')
      .send({ simulationId: sim.simulationId, profile: { ...profile, riskAppetite: 'extreme' } });
    expect(badProfile.status).toBe(400);
    const emptyQuestion = await request(app)
      .post('/api/chat')
      .send({ simulationId: sim.simulationId, question: '   ' });
    expect(emptyQuestion.status).toBe(400);
  });
});
