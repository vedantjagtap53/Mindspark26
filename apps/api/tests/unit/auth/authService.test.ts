import { describe, expect, it } from 'vitest';
import { AppError } from '../../../src/utils/errors.js';
import {
  createAccessTokenSigner,
  hashRefreshToken,
} from '../../../src/services/auth/accessToken.js';
import { createAuthService } from '../../../src/services/auth/authService.js';
import { MAX_FAILURES } from '../../../src/services/auth/loginThrottle.js';
import { TEST_PASSWORD, createAuthKit, fastHasher } from '../../support/authKit.js';

const reg = { email: 'asha@bank.test', password: TEST_PASSWORD, displayName: 'Asha Rao' };
const MISSING = '00000000-0000-4000-8000-000000000000';

const code = async (p: Promise<unknown>) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).code;
};

describe('register', () => {
  it('creates an RM, stores only a password hash and signs the user in', async () => {
    const { auth, repositories, signer } = createAuthKit();
    const result = await auth.register(reg);
    expect(result.user).toMatchObject({ email: reg.email, role: 'RM', displayName: 'Asha Rao' });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(signer.verify(result.tokens.accessToken)).toMatchObject({
      sub: result.user.id,
      role: 'RM',
    });

    const stored = await repositories.users.getById(result.user.id);
    expect(stored!.passwordHash).not.toContain(TEST_PASSWORD);
    expect(await fastHasher.verify(TEST_PASSWORD, stored!.passwordHash)).toBe(true);
    const token = await repositories.refreshTokens.getByHash(
      hashRefreshToken(result.tokens.refreshToken),
    );
    expect(token?.userId).toBe(result.user.id);
  });

  it('rejects a duplicate email with CONFLICT', async () => {
    const { auth } = createAuthKit();
    await auth.register(reg);
    expect(await code(auth.register({ ...reg, email: 'ASHA@bank.test' }))).toBe('CONFLICT');
  });

  it('fails clearly when the database is not configured', async () => {
    const kit = createAuthKit();
    const auth = createAuthService({
      hasher: fastHasher,
      signer: kit.signer,
      throttle: kit.throttle,
      refreshTtlSeconds: 60,
    });
    expect(await code(auth.register(reg))).toBe('DATABASE_NOT_CONFIGURED');
    await expect(auth.logout('anything')).resolves.toBeUndefined();
  });
});

describe('login', () => {
  it('signs in with the right password and records the login time', async () => {
    const { auth, repositories, clock } = createAuthKit();
    const { user } = await auth.register(reg);
    const result = await auth.login({ email: reg.email, password: TEST_PASSWORD }, '1.1.1.1');
    expect(result.user.id).toBe(user.id);
    const stored = await repositories.users.getById(user.id);
    expect(stored!.lastLoginAt).toBe(new Date(clock.now).toISOString());
  });

  it('gives the same error for a wrong password, an unknown email and a deactivated user', async () => {
    const { auth, repositories } = createAuthKit();
    const { user } = await auth.register(reg);
    const fail = (email: string, password: string, ip: string) =>
      auth.login({ email, password }, ip).then(
        () => {
          throw new Error('login should have failed');
        },
        (e: AppError) => e,
      );
    const wrong = await fail(reg.email, 'Wrong-Passw0rd', 'ip');
    const unknown = await fail('who@bank.test', TEST_PASSWORD, 'ip');
    await repositories.users.update(user.id, { active: false });
    const inactive = await fail(reg.email, TEST_PASSWORD, 'ip2');
    const messages = [wrong, unknown, inactive].map((e) => `${e.code}:${e.message}`);
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toBe('UNAUTHENTICATED:Incorrect email or password');
  });

  it('locks out after repeated failures, even for the right password, then recovers', async () => {
    const { auth, clock } = createAuthKit();
    await auth.register(reg);
    for (let i = 0; i < MAX_FAILURES; i++) {
      const attempt = auth.login({ email: reg.email, password: 'Wrong-Passw0rd' }, 'ip');
      expect(await code(attempt)).toBe('UNAUTHENTICATED');
    }
    const locked = auth.login({ email: reg.email, password: TEST_PASSWORD }, 'ip');
    expect(await code(locked)).toBe('TOO_MANY_REQUESTS');
    // Another address is not locked out.
    await expect(
      auth.login({ email: reg.email, password: TEST_PASSWORD }, 'other'),
    ).resolves.toBeDefined();
    clock.now += 15 * 60_000;
    await expect(
      auth.login({ email: reg.email, password: TEST_PASSWORD }, 'ip'),
    ).resolves.toBeDefined();
  });
});

describe('refresh', () => {
  it('rotates the token: the new one works and the old one is revoked', async () => {
    const { auth, repositories } = createAuthKit();
    const { tokens } = await auth.register(reg);
    const next = await auth.refresh(tokens.refreshToken);
    expect(next.tokens.refreshToken).not.toBe(tokens.refreshToken);
    const old = await repositories.refreshTokens.getByHash(hashRefreshToken(tokens.refreshToken));
    expect(old?.revokedAt).not.toBeNull();
    await expect(auth.refresh(next.tokens.refreshToken)).resolves.toBeDefined();
  });

  it('ends the whole session when a rotated token is replayed after the grace period', async () => {
    const { auth, clock } = createAuthKit();
    const { tokens } = await auth.register(reg);
    const next = await auth.refresh(tokens.refreshToken);
    clock.now += 11_000;
    expect(await code(auth.refresh(tokens.refreshToken))).toBe('UNAUTHENTICATED');
    // The legitimate holder of the newest token is signed out too.
    expect(await code(auth.refresh(next.tokens.refreshToken))).toBe('UNAUTHENTICATED');
  });

  it('refuses a replay inside the grace window without ending the session', async () => {
    const { auth } = createAuthKit();
    const { tokens } = await auth.register(reg);
    const next = await auth.refresh(tokens.refreshToken);
    expect(await code(auth.refresh(tokens.refreshToken))).toBe('UNAUTHENTICATED');
    await expect(auth.refresh(next.tokens.refreshToken)).resolves.toBeDefined();
  });

  it('rejects unknown and expired tokens', async () => {
    const { auth, clock } = createAuthKit();
    const { tokens } = await auth.register(reg);
    expect(await code(auth.refresh('not-a-real-token'))).toBe('UNAUTHENTICATED');
    clock.now += 604_800_000 + 1;
    expect(await code(auth.refresh(tokens.refreshToken))).toBe('UNAUTHENTICATED');
  });

  it('refuses a deactivated user and picks up a changed role', async () => {
    const { auth, repositories, signer } = createAuthKit();
    const { user, tokens } = await auth.register(reg);
    await repositories.users.update(user.id, { role: 'ADMIN' });
    const next = await auth.refresh(tokens.refreshToken);
    expect(signer.verify(next.tokens.accessToken)?.role).toBe('ADMIN');
    await repositories.users.update(user.id, { active: false });
    expect(await code(auth.refresh(next.tokens.refreshToken))).toBe('UNAUTHENTICATED');
  });
});

describe('logout, user lookup and settings', () => {
  it('logout revokes the session family; an unknown token is ignored', async () => {
    const { auth } = createAuthKit();
    const { tokens } = await auth.register(reg);
    await auth.logout('unknown');
    await auth.logout(undefined);
    await auth.logout(tokens.refreshToken);
    expect(await code(auth.refresh(tokens.refreshToken))).toBe('UNAUTHENTICATED');
  });

  it('getUser returns null for unknown or deactivated users', async () => {
    const { auth, repositories } = createAuthKit();
    const { user } = await auth.register(reg);
    expect(await auth.getUser(user.id)).toMatchObject({ id: user.id });
    expect(await auth.getUser(MISSING)).toBeNull();
    await repositories.users.update(user.id, { active: false });
    expect(await auth.getUser(user.id)).toBeNull();
  });

  it('merges settings changes and keeps the other settings', async () => {
    const { auth } = createAuthKit();
    const { user } = await auth.register(reg);
    expect(user.settings).toEqual({ theme: 'light', customCursor: true });
    const dark = await auth.updateSettings(user.id, { theme: 'dark' });
    expect(dark.settings).toEqual({ theme: 'dark', customCursor: true });
    const noCursor = await auth.updateSettings(user.id, { customCursor: false });
    expect(noCursor.settings).toEqual({ theme: 'dark', customCursor: false });
  });

  it('rejects settings for a user who no longer exists', async () => {
    const { auth } = createAuthKit();
    expect(await code(auth.updateSettings(MISSING, { theme: 'dark' }))).toBe('UNAUTHENTICATED');
  });
});

describe('signing is bound to the configured secret', () => {
  it('tokens from another secret do not verify', async () => {
    const { auth } = createAuthKit();
    const { tokens } = await auth.register(reg);
    const other = createAccessTokenSigner({ secret: 'z'.repeat(40), ttlSeconds: 900 });
    expect(other.verify(tokens.accessToken)).toBeNull();
  });
});
