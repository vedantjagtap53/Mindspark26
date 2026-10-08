// Simulation runs kept in API memory so /api/suitability, /api/explain and /api/chat can work from
// the backend's own numbers (the browser never sends results back). Approved by Karan 2026-10-04
// as the interim until database persistence was wired; records are lost on restart.
// This is working state for a session, not a database: nothing is written anywhere else.

import type {
  ClientProfile,
  ExplainResponse,
  SimulateModeARequest,
  SimulateModeAResponse,
  SimulateModeBRequest,
  SimulateModeBResponse,
  SuitabilityResponse,
} from '@mindspark/shared';
import { AppError } from '../../utils/errors.js';

export type SimulationRun =
  | { request: SimulateModeARequest; response: SimulateModeAResponse }
  | { request: SimulateModeBRequest; response: SimulateModeBResponse };

export type SimulationRecord = SimulationRun & {
  id: string;
  createdAt: number;
  /** The account that ran it; absent for a run made without signing in (development). */
  ownerId?: string;
  profile?: ClientProfile;
  suitability?: SuitabilityResponse;
  explanation?: ExplainResponse;
  /** Mode A forecast metadata for the audit record (no sample paths or fan, PRD §7.2). */
  forecastMeta?: Record<string, unknown>;
  /** Database ids once written (set by the first /api/suitability call; see persistenceService). */
  configurationId?: string;
  persistedSimulationId?: string;
};

export interface SimulationRecords {
  save(record: SimulationRecord): void;
  /**
   * Throws NOT_FOUND for an unknown or expired id, and for a run that belongs to another account
   * (`ownerId` is the requester; a run is never revealed to anyone but its owner).
   */
  get(id: string, ownerId?: string): SimulationRecord;
  update(id: string, patch: Partial<Omit<SimulationRecord, 'id'>>): SimulationRecord;
}

export interface MemoryRecordsConfig {
  maxRecords?: number;
  ttlMs?: number;
  now?: () => number;
}

export function createMemorySimulationRecords(config: MemoryRecordsConfig = {}): SimulationRecords {
  const maxRecords = config.maxRecords ?? 500;
  const ttlMs = config.ttlMs ?? 12 * 60 * 60 * 1000;
  const now = config.now ?? Date.now;
  // Map keeps insertion order: the first entry is the oldest.
  const records = new Map<string, SimulationRecord>();

  const notFound = () =>
    new AppError(
      'NOT_FOUND',
      'Unknown or expired simulation: run the simulation again (runs are kept until the API restarts)',
    );

  /** The run itself, whoever owns it. Only an unknown or expired run is dropped. */
  const lookup = (id: string): SimulationRecord => {
    const record = records.get(id);
    if (!record || now() - record.createdAt > ttlMs) {
      records.delete(id);
      throw notFound();
    }
    return record;
  };

  /**
   * The run for its owner. For anyone else it is simply "not found": the same answer as for an
   * unknown id, and the run is left untouched (asking for it must never be a way to remove it).
   */
  const get = (id: string, ownerId?: string): SimulationRecord => {
    const record = lookup(id);
    if (record.ownerId !== ownerId) throw notFound();
    return record;
  };

  return {
    save(record) {
      records.set(record.id, record);
      while (records.size > maxRecords) {
        const oldest = records.keys().next().value;
        if (oldest === undefined) break;
        records.delete(oldest);
      }
    },
    get,
    update(id, patch) {
      // Internal: the caller has already been checked against the owner by `get`.
      const next = { ...lookup(id), ...patch } as SimulationRecord;
      records.set(id, next);
      return next;
    },
  };
}
