// Test-only in-memory implementation of the repository interfaces. It exists to prove the
// contract suite and to back service tests; production uses the Supabase adapter.
/* eslint-disable @typescript-eslint/require-await --
   Methods stay async so that thrown RepositoryErrors become rejected promises, exactly like the real adapter. */
import { randomUUID } from 'node:crypto';
import {
  RepositoryError,
  validateSimulationInput,
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

  const configurations = new Map<string, ProductConfigurationRecord>();
  const simulations = new Map<string, StoredSimulation>();
  const verdicts = new Map<string, SuitabilityResultRecord>();
  const explanations = new Map<string, ExplanationRecord[]>();

  return {
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
