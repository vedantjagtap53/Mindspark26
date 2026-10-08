// Behaviour every Repositories implementation must have. Runs against the in-memory
// implementation and against the Supabase adapter on a local database (tests/supabase).
import { randomUUID } from 'node:crypto';
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
  userId: null,
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
  userId: null,
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

      it('lists the most recent simulations first, up to the limit', async () => {
        const first = await repos.simulations.record(modeA(configurationId));
        const second = await repos.simulations.record(modeB(configurationId));
        const third = await repos.simulations.record(modeA(configurationId));
        const two = await repos.simulations.listRecent(2);
        expect(two.map((r) => r.id)).toEqual([third, second]);
        const all = (await repos.simulations.listRecent(100)).map((r) => r.id);
        expect(all).toContain(first);
        expect(all.indexOf(third)).toBeLessThan(all.indexOf(first));
        expect(two[0]?.mode).toBe('A');
        expect(two[0]?.riskResults).toHaveLength(3);
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

    describe('runs linked to accounts', () => {
      let configurationId: string;
      let first: Awaited<ReturnType<Repositories['users']['create']>>;
      let second: Awaited<ReturnType<Repositories['users']['create']>>;
      beforeEach(async () => {
        configurationId = await repos.productConfigurations.create(elnConfig);
        const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
        first = await repos.users.create({
          email: `first-${stamp}@bank.test`,
          displayName: 'First User',
          passwordHash: 'x',
          role: 'RM',
        });
        second = await repos.users.create({
          email: `second-${stamp}@bank.test`,
          displayName: 'Second User',
          passwordHash: 'x',
          role: 'RM',
        });
      });

      it('stores the account with the run and returns it as the owner', async () => {
        const mine = await repos.simulations.record({
          ...modeB(configurationId),
          userId: first.id,
        });
        const anonymous = await repos.simulations.record(modeB(configurationId));
        expect(await repos.simulations.getById(mine)).toMatchObject({
          userId: first.id,
          owner: { id: first.id, email: first.email, displayName: 'First User' },
        });
        expect(await repos.simulations.getById(anonymous)).toMatchObject({
          userId: null,
          owner: null,
        });
      });

      it("lists one account's runs only, newest first, and counts every run", async () => {
        const a1 = await repos.simulations.record({ ...modeB(configurationId), userId: first.id });
        const b1 = await repos.simulations.record({ ...modeB(configurationId), userId: second.id });
        const a2 = await repos.simulations.record({ ...modeB(configurationId), userId: first.id });
        expect((await repos.simulations.listByUser(first.id, 10)).map((s) => s.id)).toEqual([
          a2,
          a1,
        ]);
        expect((await repos.simulations.listByUser(second.id, 10)).map((s) => s.id)).toEqual([b1]);
        expect(await repos.simulations.listByUser(first.id, 1)).toHaveLength(1);
        expect(await repos.simulations.listByUser(randomUUID(), 10)).toEqual([]);
        expect(await repos.simulations.count()).toBe(3);
      });

      it('lists only the runs saved at or after a time', async () => {
        const before = new Date(Date.now() - 60_000).toISOString();
        const id = await repos.simulations.record({ ...modeB(configurationId), userId: first.id });
        expect((await repos.simulations.listSince(before, 10)).map((s) => s.id)).toEqual([id]);
        const later = new Date(Date.now() + 3_600_000).toISOString();
        expect(await repos.simulations.listSince(later, 10)).toEqual([]);
      });

      it('rejects a run for an account that does not exist', async () => {
        await expectRepoError(
          repos.simulations.record({ ...modeB(configurationId), userId: randomUUID() }),
          'invalid_reference',
        );
      });
    });

    describe('activity events', () => {
      it('records events and lists them newest first, with the account they are about', async () => {
        const user = await repos.users.create({
          email: `act-${Date.now()}-${randomUUID().slice(0, 8)}@bank.test`,
          displayName: 'Active User',
          passwordHash: 'x',
          role: 'RM',
        });
        const before = new Date(Date.now() - 60_000).toISOString();
        await repos.activity.record({
          userId: user.id,
          actorEmail: user.email,
          event: 'LOGIN',
          detail: { role: 'RM' },
        });
        await repos.activity.record({
          userId: null,
          actorEmail: 'nobody@bank.test',
          event: 'LOGIN_FAILED',
          detail: { reason: 'unknown_email' },
        });
        const events = await repos.activity.listRecent(10);
        expect(events.slice(0, 2).map((e) => e.event)).toEqual(['LOGIN_FAILED', 'LOGIN']);
        expect(events[0]).toMatchObject({
          user: null,
          actorEmail: 'nobody@bank.test',
          detail: { reason: 'unknown_email' },
        });
        expect(events[1]).toMatchObject({
          user: { id: user.id, email: user.email, displayName: 'Active User' },
          detail: { role: 'RM' },
        });
        expect((await repos.activity.listSince(before, 10)).length).toBeGreaterThanOrEqual(2);
        expect(await repos.activity.listRecent(1)).toHaveLength(1);
      });
    });

    it('exposes no delete operations', () => {
      for (const repo of Object.values(repos) as object[]) {
        expect(Object.keys(repo).filter((k) => /delete|remove|destroy/i.test(k))).toEqual([]);
      }
    });
  });
}
