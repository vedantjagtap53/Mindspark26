// Test-only in-memory implementation of the repository interfaces. It exists to prove the
// contract suite and to back service tests; production uses the Firebase SQL Connect adapter.
/* eslint-disable @typescript-eslint/require-await --
   Methods stay async so that thrown RepositoryErrors become rejected promises, exactly like the real adapter. */
import { randomUUID } from 'node:crypto';
import {
  RepositoryError,
  validateSimulationInput,
  type ClientProfileRecord,
  type ExplanationRecord,
  type ProductConfigurationRecord,
  type Repositories,
  type SimulationRecord,
  type SuitabilityResultRecord,
} from '../../src/repositories/interfaces/index.js';

type StoredSimulation = Omit<SimulationRecord, 'suitability' | 'explanations'>;

export function createMemoryRepositories(): Repositories {
  let tick = Date.parse('2026-01-01T00:00:00Z');
  const now = () => new Date((tick += 1000)).toISOString(); // strictly increasing, for ordering
  const clone = <T>(v: T): T => structuredClone(v);

  const profiles = new Map<string, ClientProfileRecord>();
  const configurations = new Map<string, ProductConfigurationRecord>();
  const simulations = new Map<string, StoredSimulation>();
  const verdicts = new Map<string, SuitabilityResultRecord>();
  const explanations = new Map<string, ExplanationRecord[]>();

  const refTaken = (clientRef: string, exceptId?: string) =>
    [...profiles.values()].some((p) => p.clientRef === clientRef && p.id !== exceptId);

  return {
    clientProfiles: {
      async create(input) {
        if (refTaken(input.clientRef)) {
          throw new RepositoryError('conflict', 'clientRef already exists');
        }
        const id = randomUUID();
        const ts = now();
        profiles.set(id, { ...clone(input), id, createdAt: ts, updatedAt: ts });
        return id;
      },
      async update(id, input) {
        const existing = profiles.get(id);
        if (!existing) return false;
        if (refTaken(input.clientRef, id)) {
          throw new RepositoryError('conflict', 'clientRef already exists');
        }
        profiles.set(id, { ...clone(input), id, createdAt: existing.createdAt, updatedAt: now() });
        return true;
      },
      async getById(id) {
        const p = profiles.get(id);
        return p ? clone(p) : null;
      },
      async getByRef(clientRef) {
        const p = [...profiles.values()].find((x) => x.clientRef === clientRef);
        return p ? clone(p) : null;
      },
      async list({ limit, offset }) {
        return [...profiles.values()]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(offset, offset + limit)
          .map(clone);
      },
    },

    productConfigurations: {
      async create(input) {
        const id = randomUUID();
        configurations.set(id, { ...clone(input), id, createdAt: now() });
        return id;
      },
      async getById(id) {
        const c = configurations.get(id);
        return c ? clone(c) : null;
      },
    },

    simulations: {
      async record(input) {
        validateSimulationInput(input);
        const configuration = configurations.get(input.configurationId);
        if (!configuration) throw new RepositoryError('invalid_reference', 'Unknown configuration');
        if (input.profileId !== null && !profiles.has(input.profileId)) {
          throw new RepositoryError('invalid_reference', 'Unknown client profile');
        }
        const id = randomUUID();
        const ts = now();
        const { riskResults, configurationId: _configurationId, ...fields } = clone(input);
        simulations.set(id, {
          ...fields,
          id,
          createdAt: ts,
          configuration: clone(configuration),
          riskResults: riskResults.map((r) => ({ ...r, createdAt: ts })),
        });
        return id;
      },
      async getById(id) {
        const s = simulations.get(id);
        if (!s) return null;
        return clone({
          ...s,
          suitability: verdicts.get(id) ?? null,
          explanations: explanations.get(id) ?? [],
        } as SimulationRecord);
      },
      async listForProfile(profileId, limit) {
        return [...simulations.values()]
          .filter((s) => s.profileId === profileId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, limit)
          .map((s) => ({
            id: s.id,
            mode: s.mode,
            createdAt: s.createdAt,
            productType: s.configuration.productType,
            tenorDays: s.configuration.tenorDays,
            notional: s.configuration.notional,
            verdict: verdicts.get(s.id)?.verdict ?? null,
          }));
      },
    },

    suitabilityResults: {
      async create({ simulationId, ...rest }) {
        if (!simulations.has(simulationId)) {
          throw new RepositoryError('invalid_reference', 'Unknown simulation');
        }
        if (verdicts.has(simulationId)) {
          throw new RepositoryError('conflict', 'Simulation already has a verdict');
        }
        const id = randomUUID();
        verdicts.set(simulationId, { ...clone(rest), id, createdAt: now() });
        return id;
      },
    },

    explanations: {
      async create({ simulationId, ...rest }) {
        if (!simulations.has(simulationId)) {
          throw new RepositoryError('invalid_reference', 'Unknown simulation');
        }
        const id = randomUUID();
        const list = explanations.get(simulationId) ?? [];
        explanations.set(simulationId, [...list, { ...clone(rest), id, createdAt: now() }]);
        return id;
      },
    },
  };
}
