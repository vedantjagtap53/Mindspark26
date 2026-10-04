// Behaviour every Repositories implementation must have. Runs against the in-memory
// implementation and against the Supabase adapter on a local database (tests/supabase).
import { beforeEach, describe, expect, it } from 'vitest';
import {
  RepositoryError,
  type ClientProfileInput,
  type ModeASimulationInput,
  type ModeBSimulationInput,
  type ProductConfigurationInput,
  type Repositories,
  type RepositoryErrorKind,
  type RiskResultInput,
  type SimulationInput,
} from '../../src/repositories/interfaces/index.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MISSING = '00000000-0000-4000-8000-000000000000';

const profileInput = (over: Partial<ClientProfileInput> = {}): ClientProfileInput => ({
  clientRef: 'CRM-001',
  label: 'Test client',
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

const modeA = (configurationId: string, profileId: string | null): ModeASimulationInput => ({
  mode: 'A',
  configurationId,
  profileId,
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

const modeB = (configurationId: string, profileId: string | null): ModeBSimulationInput => ({
  mode: 'B',
  configurationId,
  profileId,
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

    describe('client profiles', () => {
      it('creates, reads by id and by reference', async () => {
        const id = await repos.clientProfiles.create(profileInput());
        expect(id).toMatch(UUID);
        const byId = await repos.clientProfiles.getById(id);
        expect(byId).toMatchObject({ ...profileInput(), id });
        expect(byId?.createdAt).toBe(byId?.updatedAt);
        expect(await repos.clientProfiles.getByRef('CRM-001')).toEqual(byId);
      });

      it('returns null for unknown ids and references', async () => {
        expect(await repos.clientProfiles.getById(MISSING)).toBeNull();
        expect(await repos.clientProfiles.getByRef('nobody')).toBeNull();
      });

      it('rejects a duplicate client reference', async () => {
        await repos.clientProfiles.create(profileInput());
        await expectRepoError(repos.clientProfiles.create(profileInput()), 'conflict');
      });

      it('updates editable fields and moves updatedAt', async () => {
        const id = await repos.clientProfiles.create(profileInput());
        const before = await repos.clientProfiles.getById(id);
        const changed = profileInput({ riskAppetite: 'high', label: null });
        expect(await repos.clientProfiles.update(id, changed)).toBe(true);
        const after = await repos.clientProfiles.getById(id);
        expect(after).toMatchObject({ ...changed, createdAt: before?.createdAt });
        expect(after!.updatedAt > before!.updatedAt).toBe(true);
      });

      it('update of an unknown id returns false', async () => {
        expect(await repos.clientProfiles.update(MISSING, profileInput())).toBe(false);
      });

      it("update cannot take another client's reference", async () => {
        await repos.clientProfiles.create(profileInput());
        const other = await repos.clientProfiles.create(profileInput({ clientRef: 'CRM-002' }));
        await expectRepoError(repos.clientProfiles.update(other, profileInput()), 'conflict');
      });

      it('lists most recently updated first, with paging', async () => {
        const a = await repos.clientProfiles.create(profileInput({ clientRef: 'A' }));
        const b = await repos.clientProfiles.create(profileInput({ clientRef: 'B' }));
        await repos.clientProfiles.update(a, profileInput({ clientRef: 'A', horizonMonths: 36 }));
        const all = await repos.clientProfiles.list({ limit: 10, offset: 0 });
        expect(all.map((p) => p.id)).toEqual([a, b]);
        const page = await repos.clientProfiles.list({ limit: 1, offset: 1 });
        expect(page.map((p) => p.id)).toEqual([b]);
      });
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
      let profileId: string;
      beforeEach(async () => {
        configurationId = await repos.productConfigurations.create(elnConfig);
        profileId = await repos.clientProfiles.create(profileInput());
      });

      it('records a Mode A simulation with its three case results', async () => {
        const id = await repos.simulations.record(modeA(configurationId, profileId));
        const rec = await repos.simulations.getById(id);
        expect(rec).toMatchObject({
          id,
          mode: 'A',
          profileId,
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

      it('records a Mode B simulation with its shock result', async () => {
        const id = await repos.simulations.record(modeB(configurationId, null));
        const rec = await repos.simulations.getById(id);
        expect(rec).toMatchObject({
          mode: 'B',
          profileId: null,
          levelSource: 'manual',
          levelAsOf: null,
          shockPct: -25,
        });
        expect(rec?.riskResults).toHaveLength(1);
        expect(rec?.riskResults[0]).toMatchObject({ ...shockResult });
      });

      it('keeps the frozen profile snapshot when the profile is later edited', async () => {
        const id = await repos.simulations.record(modeA(configurationId, profileId));
        await repos.clientProfiles.update(profileId, profileInput({ riskAppetite: 'high' }));
        expect((await repos.simulations.getById(id))?.profileSnapshot).toEqual(profileInput());
      });

      it('returns null for an unknown simulation', async () => {
        expect(await repos.simulations.getById(MISSING)).toBeNull();
      });

      const badInputs: Array<
        [string, (c: string, p: string) => SimulationInput, RepositoryErrorKind]
      > = [
        ['an unknown configuration', (_c, p) => modeA(MISSING, p), 'invalid_reference'],
        ['an unknown profile', (c) => modeA(c, MISSING), 'invalid_reference'],
        [
          'Mode A missing a case',
          (c, p) => ({ ...modeA(c, p), riskResults: modeA(c, p).riskResults.slice(0, 2) }),
          'invalid_input',
        ],
        [
          'duplicate scenarios',
          (c, p) => ({
            ...modeA(c, p),
            riskResults: [caseResult('low', 1), caseResult('low', 2), caseResult('high', 3)],
          }),
          'invalid_input',
        ],
        [
          'Mode B with case rows',
          (c, p) => ({ ...modeB(c, p), riskResults: modeA(c, p).riskResults }),
          'invalid_input',
        ],
        [
          'Mode A with a shock row',
          (c, p) => ({
            ...modeA(c, p),
            riskResults: [...modeA(c, p).riskResults.slice(0, 2), shockResult],
          }),
          'invalid_input',
        ],
        [
          'more than four results',
          (c, p) => ({
            ...modeA(c, p),
            riskResults: [...modeA(c, p).riskResults, caseResult('low', 1), caseResult('base', 1)],
          }),
          'invalid_input',
        ],
      ];

      it.each(badInputs)('rejects %s and writes nothing', async (_name, build, kind) => {
        await expectRepoError(repos.simulations.record(build(configurationId, profileId)), kind);
        expect(await repos.simulations.listForProfile(profileId, 10)).toEqual([]);
      });

      it('lists a profile’s simulations newest first with their verdicts', async () => {
        const first = await repos.simulations.record(modeA(configurationId, profileId));
        const second = await repos.simulations.record(modeB(configurationId, profileId));
        await repos.suitabilityResults.create({
          simulationId: first,
          verdict: 'Caution',
          flags: [],
          rulesVersion: 'v1',
        });
        const list = await repos.simulations.listForProfile(profileId, 10);
        expect(list.map((s) => s.id)).toEqual([second, first]);
        expect(list[1]).toMatchObject({
          mode: 'A',
          productType: 'ELN',
          tenorDays: 365,
          notional: 1_000_000,
          verdict: 'Caution',
        });
        expect(list[0]?.verdict).toBeNull();
        expect(await repos.simulations.listForProfile(profileId, 1)).toHaveLength(1);
      });
    });

    describe('suitability results and explanations', () => {
      let simulationId: string;
      beforeEach(async () => {
        const configurationId = await repos.productConfigurations.create(elnConfig);
        simulationId = await repos.simulations.record(modeB(configurationId, null));
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
