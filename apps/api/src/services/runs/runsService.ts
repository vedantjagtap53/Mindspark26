// "My saved runs": the signed-in account's own runs, newest first. A user only ever gets their
// own; the admin's view of everyone's runs is the audit service.
import type { AuditSimulation, SavedRunDetail } from '@mindspark/shared';
import type { Repositories } from '../../repositories/interfaces/index.js';
import { AppError } from '../../utils/errors.js';
import {
  findSimulation,
  runNotFound,
  toAuditSimulation,
  toSavedRunDetail,
} from '../audit/auditService.js';
import { toAppError } from '../persistence/persistenceService.js';

export const RUNS_DEFAULT_LIMIT = 50;
export const RUNS_MAX_LIMIT = 200;

export interface RunsService {
  mine(userId: string, limit?: number): Promise<AuditSimulation[]>;
  /** One of the account's own runs, in full. Another account's run is NOT_FOUND, like a missing one. */
  one(userId: string, id: string): Promise<SavedRunDetail>;
}

const databaseMissing = () =>
  new AppError(
    'DATABASE_NOT_CONFIGURED',
    'Saved runs need the database: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );

export function createRunsService(repositories?: Repositories): RunsService {
  return {
    async mine(userId, limit = RUNS_DEFAULT_LIMIT) {
      if (!repositories) throw databaseMissing();
      try {
        const records = await repositories.simulations.listByUser(
          userId,
          Math.min(Math.max(1, Math.trunc(limit)), RUNS_MAX_LIMIT),
        );
        return records.map(toAuditSimulation);
      } catch (err) {
        return toAppError(err);
      }
    },

    async one(userId, id) {
      if (!repositories) throw databaseMissing();
      const record = await findSimulation(repositories, id);
      // Someone else's run gets the same answer as no run, so ids reveal nothing.
      if (!record || record.userId !== userId) throw runNotFound();
      return toSavedRunDetail(record);
    },
  };
}
