// Test-only in-memory user and refresh-token repositories (same contract as the Supabase adapter).
/* eslint-disable @typescript-eslint/require-await --
   Methods stay async so that thrown RepositoryErrors become rejected promises, like the real adapter. */
import { randomUUID } from 'node:crypto';
import { DEFAULT_USER_SETTINGS } from '@mindspark/shared';
import {
  RepositoryError,
  type RefreshTokenRecord,
  type RefreshTokenRepository,
  type UserRecord,
  type UserRepository,
} from '../../src/repositories/interfaces/index.js';

export function createMemoryUserRepositories(): {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
} {
  const users = new Map<string, UserRecord>();
  const tokens = new Map<string, RefreshTokenRecord>();
  const clone = <T>(v: T): T => structuredClone(v);
  const now = () => new Date().toISOString();

  return {
    users: {
      async create(input) {
        const email = input.email.toLowerCase();
        for (const u of users.values()) {
          if (u.email.toLowerCase() === email) {
            throw new RepositoryError('conflict', 'Duplicate value: email');
          }
        }
        const user: UserRecord = {
          id: randomUUID(),
          email: input.email,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          role: input.role,
          active: true,
          settings: { ...DEFAULT_USER_SETTINGS },
          createdAt: now(),
          lastLoginAt: null,
        };
        users.set(user.id, user);
        return clone(user);
      },
      async getById(id) {
        const u = users.get(id);
        return u ? clone(u) : null;
      },
      async getByEmail(email) {
        const e = email.toLowerCase();
        for (const u of users.values()) if (u.email.toLowerCase() === e) return clone(u);
        return null;
      },
      async list() {
        return [...users.values()].map(clone);
      },
      async update(id, changes) {
        const u = users.get(id);
        if (!u) return null;
        if (changes.role !== undefined) u.role = changes.role;
        if (changes.active !== undefined) u.active = changes.active;
        if (changes.settings !== undefined) u.settings = clone(changes.settings);
        if (changes.lastLoginAt !== undefined) {
          u.lastLoginAt = new Date(changes.lastLoginAt).toISOString();
        }
        return clone(u);
      },
      async countActiveByRole(role) {
        return [...users.values()].filter((u) => u.active && u.role === role).length;
      },
    },

    refreshTokens: {
      async create(input) {
        for (const t of tokens.values()) {
          if (t.tokenHash === input.tokenHash) {
            throw new RepositoryError('conflict', 'Duplicate value: token_hash');
          }
        }
        if (!users.has(input.userId)) {
          throw new RepositoryError('invalid_reference', 'Unknown user');
        }
        const record: RefreshTokenRecord = {
          id: randomUUID(),
          ...input,
          revokedAt: null,
          replacedBy: null,
        };
        tokens.set(record.id, record);
        return clone(record);
      },
      async getByHash(tokenHash) {
        for (const t of tokens.values()) if (t.tokenHash === tokenHash) return clone(t);
        return null;
      },
      async rotate(id, replacedBy) {
        const t = tokens.get(id);
        if (t && !t.revokedAt) {
          t.revokedAt = now();
          t.replacedBy = replacedBy;
        }
      },
      async revoke(id) {
        const t = tokens.get(id);
        if (t && !t.revokedAt) t.revokedAt = now();
      },
      async revokeFamily(familyId) {
        for (const t of tokens.values()) {
          if (t.familyId === familyId && !t.revokedAt) t.revokedAt = now();
        }
      },
      async revokeAllForUser(userId) {
        for (const t of tokens.values()) {
          if (t.userId === userId && !t.revokedAt) t.revokedAt = now();
        }
      },
    },
  };
}
