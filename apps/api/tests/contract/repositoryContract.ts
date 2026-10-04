// Behaviour every Repositories implementation must have. Runs against the in-memory
// implementation and against the Supabase adapter on a local database (tests/supabase).
import { beforeEach, describe, expect, it } from 'vitest';
import {
  RepositoryError,
  type ClientProfileSnapshot,
  type ModeASimulationInput,
  type ModeBSimulationInput,
  type ProductConfigurationInput,
  type Repositories,
  type RepositoryErrorKind,
  type RiskResultInput,
  type SimulationInput,
} from '../../src/repositories/interfaces/index.js';

const MISSING = '00000000-0000-4000-8000-000000000000';

const profileInput = (over: Partial<ClientProfileSnapshot> = {}): ClientProfileSnapshot => ({
  name: 'Asha Rao',
  age: 52,
  riskAppetite: 'medium',
  horizonMonths: 24,
  lossTolerancePct: 10,
  concentrationPct: 15,
  ...over,
});

const elnConfig: ProductConfigurationInput = {
  productType: 'ELN',
  underlyingSymbol: '^NSEI',
  depositCurrency: null,
  alternateCurrency: null,
  tenorDays: 365,
  notional: 1_000_000,
  terms: {
    underlying: { symbol: '^NSEI', assetClass: 'index' },
    notional: 1_000_000,
    tenorDays: 365,
    strikePct: 100,
    couponPct: 10,
    barrierPct: 80,
    barrierType: 'American',
  },
};

const caseResult = (scenario: 'low' | 'base' | 'high', payoff: number): RiskResultInput => ({
  scenario,
  percentile: { low: 5, base: 50, high: 95 }[scenario],
  terminal: 20_000,
  pathMin: 18_000,
  payoff,
  returnPct: (payoff / 1e6 - 1) * 100,
  lossAmount: Math.max(1e6 - payoff, 0),
  knockedIn: scenario === 'low',
  details: { payoff },
});

const shockResult: RiskResultInput = {
  scenario: 'shock',
  percentile: null,
  terminal: 18_750,
  pathMin: null,
  payoff: 850_000,
  returnPct: -15,
  lossAmount: 150_000,
  knockedIn: true,
  details: { payoff: 850_000 },
};

const modeA = (configurationId: string): ModeASimulationInput => ({
  mode: 'A',
  configurationId,
  profileSnapshot: profileInput(),
  trainingWindowYears: 10,
  forecastMeta: { contractVersion: '1.0', model: { name: 'garch11-t-montecarlo' } },
  pathCount: 500,
  probabilityOfLoss: 0.028,
  probabilityOfKnockIn: 0.032,
  payoffQuantiles: { p5: 1_100_000, p50: 1_100_000, p95: 1_100_000 },
  riskResults: [
    caseResult('low', 952_214),
    caseResult('base', 1_100_000),
    caseResult('high', 1_100_000),
  ],
});

const modeB = (configurationId: string): ModeBSimulationInput => ({
  mode: 'B',
  configurationId,
  profileSnapshot: null,
  levelValue: 25_000,
  levelSource: 'manual',
  levelAsOf: null,
  shockPct: -25,
  shockedLevel: 18_750,
  riskResults: [shockResult],
});

async function expectRepoError(promise: Promise<unknown>, kind: RepositoryErrorKind) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(RepositoryError);
  expect((err as RepositoryError).kind).toBe(kind);
}

export function runRepositoryContract(name: string, make: () => Promise<Repositories>) {
  describe(`Repository contract: ${name}`, () => {
    let repos: Repositories;
    beforeEach(async () => {
      repos = await make();
    });

    describe('product configurations', () => {
      it('creates and reads back the full terms', async () => {
        const id = await repos.productConfigurations.create(elnConfig);
        expect(await repos.productConfigurations.getById(id)).toMatchObject({ ...elnConfig, id });
        expect(await repos.productConfigurations.getById(MISSING)).toBeNull();
      });
    });

    describe('simulations', () => {
      let configurationId: string;
      beforeEach(async () => {
        configurationId = await repos.productConfigurations.create(elnConfig);
      });

      it('records a Mode A simulation with its three case results', async () => {
        const id = await repos.simulations.record(modeA(configurationId));
        const rec = await repos.simulations.getById(id);
        expect(rec).toMatchObject({
          id,
          mode: 'A',
          profileSnapshot: profileInput(),
          trainingWindowYears: 10,
          probabilityOfKnockIn: 0.032,
          payoffQuantiles: { p5: 1_100_000, p50: 1_100_000, p95: 1_100_000 },
          configuration: { id: configurationId, productType: 'ELN' },
          suitability: null,
          explanations: [],
        });
        expect(rec?.riskResults.map((r) => r.scenario).sort()).toEqual(['base', 'high', 'low']);
        expect(rec?.riskResults.find((r) => r.scenario === 'low')).toMatchObject({
          knockedIn: true,
          percentile: 5,
          payoff: 952_214,
        });
      });

      it('stores a fractional training window (30 days to 3 years) exactly', async () => {
        for (const years of [30 / 365, 0.5, 2.4, 3]) {
          const id = await repos.simulations.record({
            ...modeA(configurationId),
            trainingWindowYears: years,
          });
          const rec = await repos.simulations.getById(id);
          expect(rec?.mode === 'A' && rec.trainingWindowYears).toBe(years);
        }
      });

      it('records a Mode B simulation with its shock result', async () => {
        const id = await repos.simulations.record(modeB(configurationId));
        const rec = await repos.simulations.getById(id);
        expect(rec).toMatchObject({
          mode: 'B',
          profileSnapshot: null,
          levelSource: 'manual',
          levelAsOf: null,
          shockPct: -25,
        });
        expect(rec?.riskResults).toHaveLength(1);
        expect(rec?.riskResults[0]).toMatchObject({ ...shockResult });
      });

      it('stores the client as entered (name, age and the rule fields) with the simulation', async () => {
        const id = await repos.simulations.record(modeA(configurationId));
        const snapshot = (await repos.simulations.getById(id))?.profileSnapshot;
        expect(snapshot).toEqual(profileInput());
        expect(snapshot).toMatchObject({ name: 'Asha Rao', age: 52 });
      });

      it('returns null for an unknown simulation', async () => {
        expect(await repos.simulations.getById(MISSING)).toBeNull();
      });

      const badInputs: Array<[string, (c: string) => SimulationInput, RepositoryErrorKind]> = [
        ['an unknown configuration', () => modeA(MISSING), 'invalid_reference'],
        [
          'Mode A missing a case',
          (c) => ({ ...modeA(c), riskResults: modeA(c).riskResults.slice(0, 2) }),
          'invalid_input',
        ],
        [
          'duplicate scenarios',
          (c) => ({
            ...modeA(c),
            riskResults: [caseResult('low', 1), caseResult('low', 2), caseResult('high', 3)],
          }),
          'invalid_input',
        ],
        [
          'Mode B with case rows',
          (c) => ({ ...modeB(c), riskResults: modeA(c).riskResults }),
          'invalid_input',
        ],
        [
          'Mode A with a shock row',
          (c) => ({
            ...modeA(c),
            riskResults: [...modeA(c).riskResults.slice(0, 2), shockResult],
          }),
          'invalid_input',
        ],
        [
          'more than four results',
          (c) => ({
            ...modeA(c),
            riskResults: [...modeA(c).riskResults, caseResult('low', 1), caseResult('base', 1)],
          }),
          'invalid_input',
        ],
      ];

      it.each(badInputs)('rejects %s', async (_name, build, kind) => {
        await expectRepoError(repos.simulations.record(build(configurationId)), kind);
      });
    });

    describe('suitability results and explanations', () => {
      let simulationId: string;
      beforeEach(async () => {
        const configurationId = await repos.productConfigurations.create(elnConfig);
        simulationId = await repos.simulations.record(modeB(configurationId));
      });

      it('stores one verdict per simulation', async () => {
        const flags = [{ rule: 'knock-in-low-case', hard: false, reason: 'Barrier knocked in' }];
        const id = await repos.suitabilityResults.create({
          simulationId,
          verdict: 'Caution',
          flags,
          rulesVersion: 'v1',
        });
        expect((await repos.simulations.getById(simulationId))?.suitability).toMatchObject({
          id,
          verdict: 'Caution',
          flags,
          rulesVersion: 'v1',
        });
        await expectRepoError(
          repos.suitabilityResults.create({
            simulationId,
            verdict: 'Suitable',
            flags: [],
            rulesVersion: 'v1',
          }),
          'conflict',
        );
      });

      it('rejects a verdict or explanation for an unknown simulation', async () => {
        await expectRepoError(
          repos.suitabilityResults.create({
            simulationId: MISSING,
            verdict: 'Suitable',
            flags: [],
            rulesVersion: 'v1',
          }),
          'invalid_reference',
        );
        await expectRepoError(
          repos.explanations.create({
            simulationId: MISSING,
            text: 't',
            model: 'm',
            sources: null,
          }),
          'invalid_reference',
        );
      });

      it('stores explanations in order', async () => {
        await repos.explanations.create({
          simulationId,
          text: 'first',
          model: 'm',
          sources: ['a'],
        });
        await repos.explanations.create({
          simulationId,
          text: 'second',
          model: 'm',
          sources: null,
        });
        const rec = await repos.simulations.getById(simulationId);
        expect(rec?.explanations.map((e) => e.text)).toEqual(['first', 'second']);
        expect(rec?.explanations[0]?.sources).toEqual(['a']);
      });
    });

    it('exposes no delete operations', () => {
      for (const repo of Object.values(repos) as object[]) {
        expect(Object.keys(repo).filter((k) => /delete|remove|destroy/i.test(k))).toEqual([]);
      }
    });
  });
}
