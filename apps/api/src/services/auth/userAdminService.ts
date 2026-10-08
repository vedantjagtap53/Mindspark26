// User management for admins: list, create with any role, change role, deactivate.
import type { AdminUser, CreateUserRequest, UpdateUserRequest } from '@mindspark/shared';
import {
  RepositoryError,
  type Repositories,
  type UserRecord,
} from '../../repositories/interfaces/index.js';
import { AppError } from '../../utils/errors.js';
import type { ActivityLog } from '../activity/activityLog.js';
import { toAppError } from '../persistence/persistenceService.js';
import { toAuthUser } from './authService.js';
import type { PasswordHasher } from './passwordHasher.js';

export interface UserAdminService {
  list(): Promise<AdminUser[]>;
  /** `actorId` is the admin creating the account; it is only written to the activity log. */
  create(input: CreateUserRequest, actorId?: string): Promise<AdminUser>;
  /** `actorId` is the admin making the change: they cannot demote or deactivate themselves. */
  update(actorId: string, userId: string, changes: UpdateUserRequest): Promise<AdminUser>;
}

const toAdminUser = (u: UserRecord): AdminUser => ({
  ...toAuthUser(u),
  active: u.active,
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt,
});

export function createUserAdminService(deps: {
  repositories?: Repositories;
  hasher: PasswordHasher;
  activity?: ActivityLog;
}): UserAdminService {
  const repos = (): Repositories => {
    if (!deps.repositories) {
      throw new AppError(
        'DATABASE_NOT_CONFIGURED',
        'Accounts need the database: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
      );
    }
    return deps.repositories;
  };

  return {
    async list() {
      try {
        return (await repos().users.list()).map(toAdminUser);
      } catch (err) {
        return toAppError(err);
      }
    },

    async create({ email, password, displayName, role }, actorId) {
      const r = repos();
      try {
        const user = await r.users.create({
          email,
          displayName,
          passwordHash: await deps.hasher.hash(password),
          role,
        });
        await deps.activity?.record({
          userId: user.id,
          actorEmail: user.email,
          event: 'USER_CREATED',
          detail: { role, byUserId: actorId ?? null },
        });
        return toAdminUser(user);
      } catch (err) {
        if (err instanceof RepositoryError && err.kind === 'conflict') {
          throw new AppError('CONFLICT', 'An account with this email already exists');
        }
        return toAppError(err);
      }
    },

    async update(actorId, userId, changes) {
      const r = repos();
      try {
        const target = await r.users.getById(userId);
        if (!target) throw new AppError('NOT_FOUND', 'User not found');

        const demoting = changes.role !== undefined && changes.role !== target.role;
        const deactivating = changes.active === false && target.active;
        if (userId === actorId && (demoting || deactivating)) {
          throw new AppError('FORBIDDEN', 'You cannot change your own role or deactivate yourself');
        }
        const losesAdmin = target.role === 'ADMIN' && target.active && (demoting || deactivating);
        if (losesAdmin && (await r.users.countActiveByRole('ADMIN')) <= 1) {
          throw new AppError('CONFLICT', 'There must be at least one active admin');
        }

        const updated = await r.users.update(userId, {
          ...(changes.role !== undefined ? { role: changes.role } : {}),
          ...(changes.active !== undefined ? { active: changes.active } : {}),
        });
        if (!updated) throw new AppError('NOT_FOUND', 'User not found');
        // A changed role or a deactivation ends their sessions: they sign in again with the new rights.
        if (demoting || changes.active !== undefined) {
          await r.refreshTokens.revokeAllForUser(userId);
        }
        if (changes.role !== undefined && changes.role !== target.role) {
          await deps.activity?.record({
            userId,
            actorEmail: updated.email,
            event: 'ROLE_CHANGED',
            detail: { from: target.role, to: updated.role, byUserId: actorId },
          });
        }
        if (changes.active !== undefined && changes.active !== target.active) {
          await deps.activity?.record({
            userId,
            actorEmail: updated.email,
            event: changes.active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
            detail: { byUserId: actorId },
          });
        }
        return toAdminUser(updated);
      } catch (err) {
        return toAppError(err);
      }
    },
  };
}
