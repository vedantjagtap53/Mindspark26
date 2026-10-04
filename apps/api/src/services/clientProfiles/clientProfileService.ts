// Saved client profiles (API_SPEC.md /client-profiles): supporting CRUD so an RM can reuse a
// profile in /suitability. Not CRM: no login, ownership or roles; no delete (decided 2026-10-04).

import type { SavedProfile, SavedProfileInput } from '@mindspark/shared';
import type { ClientProfileRecord, Repositories } from '../../repositories/interfaces/index.js';
import { AppError } from '../../utils/errors.js';
import { toAppError } from '../persistence/persistenceService.js';

export interface ClientProfileService {
  list(page: { limit: number; offset: number }): Promise<SavedProfile[]>;
  get(id: string): Promise<SavedProfile>;
  create(input: SavedProfileInput): Promise<SavedProfile>;
  update(id: string, input: SavedProfileInput): Promise<SavedProfile>;
}

const toSaved = (r: ClientProfileRecord): SavedProfile => ({
  id: r.id,
  clientRef: r.clientRef,
  label: r.label,
  riskAppetite: r.riskAppetite,
  horizonMonths: r.horizonMonths,
  lossTolerancePct: r.lossTolerancePct,
  concentrationPct: r.concentrationPct,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const notFound = () => new AppError('NOT_FOUND', 'Saved client profile not found');

/** `repositories` is absent when Supabase is not configured: every call then says so. */
export function createClientProfileService(repositories?: Repositories): ClientProfileService {
  const repo = () => {
    if (!repositories) {
      throw new AppError(
        'DATABASE_NOT_CONFIGURED',
        'Saved profiles need the database: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
      );
    }
    return repositories.clientProfiles;
  };

  const run = async <T>(op: () => Promise<T>): Promise<T> => {
    try {
      return await op();
    } catch (err) {
      return toAppError(err);
    }
  };

  const get = (id: string) =>
    run(async () => {
      const row = await repo().getById(id);
      if (!row) throw notFound();
      return toSaved(row);
    });

  return {
    list: (page) => run(async () => (await repo().list(page)).map(toSaved)),
    get,
    create: (input) =>
      run(async () => {
        const id = await repo().create(input);
        return get(id);
      }),
    update: (id, input) =>
      run(async () => {
        if (!(await repo().update(id, input))) throw notFound();
        return get(id);
      }),
  };
}
