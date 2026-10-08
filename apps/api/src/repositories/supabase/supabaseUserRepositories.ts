// Supabase implementation of the user and refresh-token repositories.
// Must pass tests/contract/userRepositoryContract.ts.

import {
  DEFAULT_USER_SETTINGS,
  userSettingsSchema,
  type UserRole,
  type UserSettings,
} from '@mindspark/shared';
import type {
  RefreshTokenRecord,
  RefreshTokenRepository,
  UserRecord,
  UserRepository,
} from '../interfaces/index.js';
import { toIso } from './mapping.js';
import { unwrap, type Db } from './supabaseClient.js';

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  active: boolean;
  settings: unknown;
  created_at: string;
  last_login_at: string | null;
}

interface TokenRow {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  replaced_by: string | null;
}

const USER_COLUMNS =
  'id, email, display_name, password_hash, role, active, settings, created_at, last_login_at';
const TOKEN_COLUMNS = 'id, user_id, family_id, token_hash, expires_at, revoked_at, replaced_by';

/** A stored settings object may predate a setting or hold junk: fill gaps, drop what is invalid. */
function toSettings(raw: unknown): UserSettings {
  const parsed = userSettingsSchema.partial().safeParse(raw);
  return { ...DEFAULT_USER_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}

const toUser = (r: UserRow): UserRecord => ({
  id: r.id,
  email: r.email,
  displayName: r.display_name,
  passwordHash: r.password_hash,
  role: r.role,
  active: r.active,
  settings: toSettings(r.settings),
  createdAt: toIso(r.created_at),
  lastLoginAt: r.last_login_at ? toIso(r.last_login_at) : null,
});

const toToken = (r: TokenRow): RefreshTokenRecord => ({
  id: r.id,
  userId: r.user_id,
  familyId: r.family_id,
  tokenHash: r.token_hash,
  expiresAt: toIso(r.expires_at),
  revokedAt: r.revoked_at ? toIso(r.revoked_at) : null,
  replacedBy: r.replaced_by,
});

export function createSupabaseUserRepository(db: Db): UserRepository {
  return {
    async create(input) {
      const row = unwrap<UserRow>(
        await db
          .from('app_users')
          .insert({
            email: input.email,
            display_name: input.displayName,
            password_hash: input.passwordHash,
            role: input.role,
          })
          .select(USER_COLUMNS)
          .single(),
      );
      return toUser(row);
    },
    async getById(id) {
      const row = unwrap<UserRow | null>(
        await db.from('app_users').select(USER_COLUMNS).eq('id', id).maybeSingle(),
      );
      return row ? toUser(row) : null;
    },
    async getByEmail(email) {
      // ilike without wildcards is a case-insensitive equality; escape the LIKE metacharacters.
      const exact = email.replace(/[\\%_]/g, (ch) => '\\' + ch);
      const row = unwrap<UserRow | null>(
        await db.from('app_users').select(USER_COLUMNS).ilike('email', exact).maybeSingle(),
      );
      return row ? toUser(row) : null;
    },
    async list() {
      const rows = unwrap<UserRow[]>(
        await db.from('app_users').select(USER_COLUMNS).order('created_at', { ascending: true }),
      );
      return rows.map(toUser);
    },
    async update(id, changes) {
      const patch: Record<string, unknown> = {};
      if (changes.role !== undefined) patch.role = changes.role;
      if (changes.active !== undefined) patch.active = changes.active;
      if (changes.settings !== undefined) patch.settings = changes.settings;
      if (changes.lastLoginAt !== undefined) patch.last_login_at = changes.lastLoginAt;
      const row = unwrap<UserRow | null>(
        await db.from('app_users').update(patch).eq('id', id).select(USER_COLUMNS).maybeSingle(),
      );
      return row ? toUser(row) : null;
    },
    async countActiveByRole(role) {
      const res = await db
        .from('app_users')
        .select('id', { count: 'exact', head: true })
        .eq('role', role)
        .eq('active', true);
      unwrap<null>(res);
      return res.count ?? 0;
    },
  };
}

export function createSupabaseRefreshTokenRepository(db: Db): RefreshTokenRepository {
  const now = () => new Date().toISOString();
  return {
    async create(input) {
      const row = unwrap<TokenRow>(
        await db
          .from('refresh_tokens')
          .insert({
            user_id: input.userId,
            family_id: input.familyId,
            token_hash: input.tokenHash,
            expires_at: input.expiresAt,
          })
          .select(TOKEN_COLUMNS)
          .single(),
      );
      return toToken(row);
    },
    async getByHash(tokenHash) {
      const row = unwrap<TokenRow | null>(
        await db
          .from('refresh_tokens')
          .select(TOKEN_COLUMNS)
          .eq('token_hash', tokenHash)
          .maybeSingle(),
      );
      return row ? toToken(row) : null;
    },
    async rotate(id, replacedBy) {
      unwrap<null>(
        await db
          .from('refresh_tokens')
          .update({ revoked_at: now(), replaced_by: replacedBy })
          .eq('id', id)
          .is('revoked_at', null),
      );
    },
    async revoke(id) {
      unwrap<null>(
        await db
          .from('refresh_tokens')
          .update({ revoked_at: now() })
          .eq('id', id)
          .is('revoked_at', null),
      );
    },
    async revokeFamily(familyId) {
      unwrap<null>(
        await db
          .from('refresh_tokens')
          .update({ revoked_at: now() })
          .eq('family_id', familyId)
          .is('revoked_at', null),
      );
    },
    async revokeAllForUser(userId) {
      unwrap<null>(
        await db
          .from('refresh_tokens')
          .update({ revoked_at: now() })
          .eq('user_id', userId)
          .is('revoked_at', null),
      );
    },
  };
}
