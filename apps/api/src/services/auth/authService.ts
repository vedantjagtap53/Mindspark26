// Registration, login, session refresh and settings. Controllers call this; it reaches the
// database only through the repository interfaces (users, refreshTokens).
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_USER_SETTINGS,
  type AuthUser,
  type LoginRequest,
  type RegisterRequest,
  type UpdateSettingsRequest,
  type UserRole,
} from '@mindspark/shared';
import {
  RepositoryError,
  type Repositories,
  type UserRecord,
} from '../../repositories/interfaces/index.js';
import { AppError } from '../../utils/errors.js';
import type { ActivityLog } from '../activity/activityLog.js';
import { toAppError } from '../persistence/persistenceService.js';
import { hashRefreshToken, newRefreshToken, type AccessTokenSigner } from './accessToken.js';
import type { LoginThrottle } from './loginThrottle.js';
import type { PasswordHasher } from './passwordHasher.js';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: AuthUser;
  tokens: SessionTokens;
}

export interface AuthService {
  /** Public registration: always creates an RM and signs them in. */
  register(input: RegisterRequest): Promise<AuthResult>;
  /** `clientKey` (usually the IP address) scopes the brute-force throttle. */
  login(input: LoginRequest, clientKey: string): Promise<AuthResult>;
  /** Rotates the refresh token. A replayed (already used) token ends the whole session family. */
  refresh(refreshToken: string): Promise<AuthResult>;
  logout(refreshToken: string | undefined): Promise<void>;
  getUser(userId: string): Promise<AuthUser | null>;
  updateSettings(userId: string, changes: UpdateSettingsRequest): Promise<AuthUser>;
}

export const toAuthUser = (u: UserRecord): AuthUser => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  role: u.role,
  settings: u.settings,
});

const INVALID_CREDENTIALS = 'Incorrect email or password';
/** A second use of a rotated refresh token within this time is a concurrent request, not theft. */
const REFRESH_REUSE_GRACE_MS = 10_000;

export interface AuthServiceDeps {
  repositories?: Repositories;
  hasher: PasswordHasher;
  signer: AccessTokenSigner;
  throttle: LoginThrottle;
  refreshTtlSeconds: number;
  /** Where sign-ups, sign-ins and sign-outs are logged for the admin console. */
  activity?: ActivityLog;
  now?: () => number;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { hasher, signer, throttle } = deps;
  const now = deps.now ?? (() => Date.now());
  // Verified against when the email is unknown, so timing does not reveal which emails exist.
  let dummyHash: Promise<string> | undefined;
  const getDummyHash = () => (dummyHash ??= hasher.hash('timing-equalisation-only'));

  const repos = (): Repositories => {
    if (!deps.repositories) {
      throw new AppError(
        'DATABASE_NOT_CONFIGURED',
        'Accounts need the database: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
      );
    }
    return deps.repositories;
  };

  const issue = async (
    r: Repositories,
    user: UserRecord,
    familyId: string,
  ): Promise<{ tokens: SessionTokens; tokenId: string }> => {
    const refreshToken = newRefreshToken();
    const record = await r.refreshTokens.create({
      userId: user.id,
      familyId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(now() + deps.refreshTtlSeconds * 1000).toISOString(),
    });
    return {
      tokens: { accessToken: signer.sign({ id: user.id, role: user.role }), refreshToken },
      tokenId: record.id,
    };
  };

  const unauthenticated = (message = 'Your session has expired. Sign in again.') =>
    new AppError('UNAUTHENTICATED', message);

  return {
    async register({ email, password, displayName }) {
      const r = repos();
      try {
        const user = await r.users.create({
          email,
          displayName,
          passwordHash: await hasher.hash(password),
          role: 'RM' satisfies UserRole,
        });
        const { tokens } = await issue(r, user, randomUUID());
        await deps.activity?.record({
          userId: user.id,
          actorEmail: user.email,
          event: 'REGISTER',
          detail: {},
        });
        return { user: toAuthUser(user), tokens };
      } catch (err) {
        if (err instanceof RepositoryError && err.kind === 'conflict') {
          throw new AppError('CONFLICT', 'An account with this email already exists');
        }
        return toAppError(err);
      }
    },

    async login({ email, password }, clientKey) {
      const r = repos();
      const key = `${clientKey}|${email}`;
      const wait = throttle.retryAfterSeconds(key);
      if (wait > 0) {
        throw new AppError(
          'TOO_MANY_REQUESTS',
          `Too many failed sign-in attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`,
        );
      }
      try {
        const user = await r.users.getByEmail(email);
        const ok = await hasher.verify(password, user?.passwordHash ?? (await getDummyHash()));
        if (!user || !ok || !user.active) {
          throttle.recordFailure(key);
          // Logged for the admin only. The person signing in is told nothing about which it was.
          await deps.activity?.record({
            userId: user?.id ?? null,
            actorEmail: email,
            event: 'LOGIN_FAILED',
            detail: {
              reason: !user ? 'unknown_email' : !user.active ? 'inactive' : 'wrong_password',
            },
          });
          throw new AppError('UNAUTHENTICATED', INVALID_CREDENTIALS);
        }
        throttle.recordSuccess(key);
        await r.users.update(user.id, { lastLoginAt: new Date(now()).toISOString() });
        const { tokens } = await issue(r, user, randomUUID());
        await deps.activity?.record({
          userId: user.id,
          actorEmail: user.email,
          event: 'LOGIN',
          detail: { role: user.role },
        });
        return { user: toAuthUser(user), tokens };
      } catch (err) {
        return toAppError(err);
      }
    },

    async refresh(refreshToken) {
      const r = repos();
      try {
        const stored = await r.refreshTokens.getByHash(hashRefreshToken(refreshToken));
        if (!stored) throw unauthenticated();
        if (stored.revokedAt) {
          const age = now() - Date.parse(stored.revokedAt);
          if (stored.replacedBy && age > REFRESH_REUSE_GRACE_MS) {
            // A rotated token came back late: it may have been stolen. End the whole session.
            await r.refreshTokens.revokeFamily(stored.familyId);
          }
          throw unauthenticated();
        }
        if (Date.parse(stored.expiresAt) <= now()) throw unauthenticated();
        const user = await r.users.getById(stored.userId);
        if (!user?.active) {
          await r.refreshTokens.revokeFamily(stored.familyId);
          throw unauthenticated();
        }
        const next = await issue(r, user, stored.familyId);
        await r.refreshTokens.rotate(stored.id, next.tokenId);
        return { user: toAuthUser(user), tokens: next.tokens };
      } catch (err) {
        return toAppError(err);
      }
    },

    async logout(refreshToken) {
      if (!refreshToken || !deps.repositories) return;
      try {
        const stored = await deps.repositories.refreshTokens.getByHash(
          hashRefreshToken(refreshToken),
        );
        if (stored) {
          await deps.repositories.refreshTokens.revokeFamily(stored.familyId);
          await deps.activity?.record({
            userId: stored.userId,
            actorEmail: null,
            event: 'LOGOUT',
            detail: {},
          });
        }
      } catch (err) {
        toAppError(err);
      }
    },

    async getUser(userId) {
      try {
        const user = await repos().users.getById(userId);
        return user?.active ? toAuthUser(user) : null;
      } catch (err) {
        return toAppError(err);
      }
    },

    async updateSettings(userId, changes) {
      const r = repos();
      try {
        const user = await r.users.getById(userId);
        if (!user?.active) throw unauthenticated();
        const settings = { ...DEFAULT_USER_SETTINGS, ...user.settings, ...changes };
        const updated = await r.users.update(userId, { settings });
        if (!updated) throw unauthenticated();
        return toAuthUser(updated);
      } catch (err) {
        return toAppError(err);
      }
    },
  };
}
