// Users and refresh tokens (supabase/migrations/20261007100000_auth_users.sql). Emails are
// compared case-insensitively; callers pass them lowercased. A second user with the same email
// → RepositoryError('conflict').

import type { UserRole, UserSettings } from '@mindspark/shared';

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  /** Salted scrypt hash; never leaves the API. */
  passwordHash: string;
  role: UserRole;
  active: boolean;
  settings: UserSettings;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UserInput {
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
}

export interface UserRepository {
  create(input: UserInput): Promise<UserRecord>;
  getById(id: string): Promise<UserRecord | null>;
  getByEmail(email: string): Promise<UserRecord | null>;
  /** Oldest first. */
  list(): Promise<UserRecord[]>;
  /** Returns the updated user, or null when the id is unknown. */
  update(
    id: string,
    changes: { role?: UserRole; active?: boolean; settings?: UserSettings; lastLoginAt?: string },
  ): Promise<UserRecord | null>;
  /** Number of active users with the given role (guards against removing the last admin). */
  countActiveByRole(role: UserRole): Promise<number>;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  replacedBy: string | null;
}

export interface RefreshTokenInput {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: string;
}

export interface RefreshTokenRepository {
  create(input: RefreshTokenInput): Promise<RefreshTokenRecord>;
  getByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Revokes the token and links its successor. A no-op if it is already revoked. */
  rotate(id: string, replacedBy: string): Promise<void>;
  revoke(id: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}
