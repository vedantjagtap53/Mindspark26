// Test-only in-memory implementation of the repository interfaces. It exists to prove the
// contract suite and to back service tests; production uses the Supabase adapter.
/* eslint-disable @typescript-eslint/require-await --
   Methods stay async so that thrown RepositoryErrors become rejected promises, exactly like the real adapter. */
import { randomUUID } from 'node:crypto';
import type { ActivityEvent } from '@mindspark/shared';
import {
  RepositoryError,
  validateSimulationInput,
  type ExplanationRecord,
  type ProductConfigurationRecord,
  type Repositories,
  type SimulationRecord,
  type SuitabilityResultRecord,
} from '../../src/repositories/interfaces/index.js';
import { createMemoryUserRepositories } from './memoryUserRepositories.js';

type StoredSimulation = Omit<SimulationRecord, 'suitability' | 'explanations' | 'owner'>;

export function createMemoryRepositories(): Repositories {
  // Real time, but strictly increasing even within one millisecond: ordering stays stable and
  // time filters (listSince) behave as they do on the real database.
  let last = 0;
  const now = () => new Date((last = Math.max(Date.now(), last + 1))).toISOString();
  const clone = <T>(v: T): T => structuredClone(v);

  const configurations = new Map<string, ProductConfigurationRecord>();
  const simulations = new Map<string, StoredSimulation>();
  const verdicts = new Map<string, SuitabilityResultRecord>();
  const explanations = new Map<string, ExplanationRecord[]>();
  const events: ActivityEvent[] = [];
  const userRepos = createMemoryUserRepositories();

  /** A stored simulation as the interface returns it: verdict, explanations and owner joined in. */
  const full = async (s: StoredSimulation): Promise<SimulationRecord> => {
    const user = s.userId ? await userRepos.users.getById(s.userId) : null;
    return clone({
      ...s,
      owner: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
      suitability: verdicts.get(s.id) ?? null,
      explanations: explanations.get(s.id) ?? [],
    } as SimulationRecord);
  };
  const newestFirst = (list: StoredSimulation[]) =>
    [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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
        if (input.userId && !(await userRepos.users.getById(input.userId))) {
          throw new RepositoryError('invalid_reference', 'Unknown user');
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
        return s ? full(s) : null;
      },
      async listRecent(limit) {
        return Promise.all(
          newestFirst([...simulations.values()])
            .slice(0, limit)
            .map(full),
        );
      },
      async listByUser(userId, limit) {
        const mine = [...simulations.values()].filter((s) => s.userId === userId);
        return Promise.all(newestFirst(mine).slice(0, limit).map(full));
      },
      async listSince(sinceIso, limit) {
        const recent = [...simulations.values()].filter((s) => s.createdAt >= sinceIso);
        return Promise.all(newestFirst(recent).slice(0, limit).map(full));
      },
      async count() {
        return simulations.size;
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

    activity: {
      async record({ userId, actorEmail, event, detail }) {
        const user = userId ? await userRepos.users.getById(userId) : null;
        events.push({
          id: randomUUID(),
          createdAt: now(),
          event,
          user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
          actorEmail,
          detail: clone(detail),
        });
      },
      async listRecent(limit) {
        return clone([...events].reverse().slice(0, limit));
      },
      async listSince(sinceIso, limit) {
        return clone(
          [...events]
            .reverse()
            .filter((e) => e.createdAt >= sinceIso)
            .slice(0, limit),
        );
      },
    },

    ...userRepos,
  };
}
