// The full app (simulate → suitability → explain, and /client-profiles) writing through the real
// Supabase adapter. Run from supabaseRepositories.local.test.ts so it never overlaps the contract
// suite, which empties the tables between tests.
import request from 'supertest';
import { expect, it } from 'vitest';
import type { SavedProfile, SimulateModeAResponse, SuitabilityResponse } from '@mindspark/shared';
import { createApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config/index.js';
import { createSupabaseClient } from '../../src/repositories/supabase/supabaseClient.js';
import { createSupabaseRepositories } from '../../src/repositories/supabase/supabaseRepositories.js';
import type { ForecastClient } from '../../src/services/ai/forecastClient.js';
import type { RagClient } from '../../src/services/ai/ragClient.js';
import { createMarketDataService } from '../../src/services/market-data/marketDataService.js';
import { silentLogger } from '../../src/utils/logger.js';
import { makeForecast } from '../fixtures/forecast.js';

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
const forecast: ForecastClient = {
  forecast: (req) => Promise.resolve(makeForecast({ tenorDays: req.tenorDays })),
};

export function runPersistenceFlow(config: AppConfig) {
  it('stores profile, Mode A simulation, verdict and explanation', async () => {
    // No repositories injected: the app builds the Supabase adapter from its config.
    const app = createApp(config, silentLogger, {
      marketData: createMarketDataService({}),
      rag,
      forecast,
    });
    const ref = `E2E-${Date.now()}`;
    const created = await request(app).post('/api/client-profiles').send({
      clientRef: ref,
      label: null,
      riskAppetite: 'high',
      horizonMonths: 24,
      lossTolerancePct: 30,
      concentrationPct: 10,
    });
    expect(created.status).toBe(201);
    const profile = created.body as SavedProfile;

    const sim = await request(app)
      .post('/api/simulate')
      .send({
        mode: 'A',
        productType: 'ELN',
        terms: {
          underlying: { symbol: '^NSEI', assetClass: 'index' },
          notional: 1_000_000,
          tenorDays: 182,
          strikePct: 100,
          couponPct: 10,
          barrierPct: 80,
          barrierType: 'American',
        },
      });
    expect(sim.status).toBe(200);
    const { simulationId } = sim.body as SimulateModeAResponse;

    const suit = await request(app)
      .post('/api/suitability')
      .send({
        simulationId,
        profileId: profile.id,
        profile: {
          riskAppetite: 'high',
          horizonMonths: 24,
          lossTolerancePct: 30,
          concentrationPct: 10,
        },
      });
    expect(suit.status).toBe(200);
    expect((suit.body as SuitabilityResponse).persisted).toBe(true);
    expect((await request(app).post('/api/explain').send({ simulationId })).status).toBe(200);

    const repos = createSupabaseRepositories(createSupabaseClient(config.database));
    const [summary] = await repos.simulations.listForProfile(profile.id, 5);
    const record = await repos.simulations.getById(summary!.id);
    expect(record).toMatchObject({
      mode: 'A',
      trainingWindowYears: 10,
      profileId: profile.id,
      profileSnapshot: { clientRef: ref, lossTolerancePct: 30 },
      suitability: { verdict: (suit.body as SuitabilityResponse).verdict },
      forecastMeta: { contractVersion: '1.0', backtest: { bandCoverage: 0.88 } },
    });
    expect(record!.mode === 'A' && record!.forecastMeta).not.toHaveProperty('samplePaths');
    expect(record!.riskResults.map((r) => r.scenario).sort()).toEqual(['base', 'high', 'low']);
    expect(record!.explanations).toHaveLength(1);
  });
}
