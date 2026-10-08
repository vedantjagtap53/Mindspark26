import { describe, expect, it } from 'vitest';
import { AppError } from '../../../src/utils/errors.js';
import { TEST_PASSWORD, createAuthKit } from '../../support/authKit.js';

const MISSING = '00000000-0000-4000-8000-000000000000';

const code = async (p: Promise<unknown>) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).code;
};

const input = () => ({
  email: 'new@bank.test',
  password: TEST_PASSWORD,
  displayName: 'New User',
  role: 'ADMIN' as const,
});
const rm = { email: 'rm@bank.test', password: TEST_PASSWORD, displayName: 'RM' };

describe('user admin service', () => {
  it('creates a user with the requested role and lists users without password hashes', async () => {
    const { admin } = createAuthKit();
    const created = await admin.create(input());
    expect(created).toMatchObject({ role: 'ADMIN', active: true, lastLoginAt: null });
    const users = await admin.list();
    expect(users).toHaveLength(1);
    expect(JSON.stringify(users)).not.toContain('passwordHash');
    expect(JSON.stringify(users)).not.toContain('scrypt');
  });

  it('rejects a duplicate email', async () => {
    const { admin } = createAuthKit();
    await admin.create(input());
    expect(await code(admin.create(input()))).toBe('CONFLICT');
  });

  it('changes a role and signs the user out everywhere', async () => {
    const { admin, auth, seedUser } = createAuthKit();
    const actor = await seedUser('ADMIN');
    const { user, tokens } = await auth.register(rm);
    const updated = await admin.update(actor.id, user.id, { role: 'ADMIN' });
    expect(updated.role).toBe('ADMIN');
    expect(await code(auth.refresh(tokens.refreshToken))).toBe('UNAUTHENTICATED');
  });

  it('deactivates a user, who then cannot sign in', async () => {
    const { admin, auth, seedUser } = createAuthKit();
    const actor = await seedUser('ADMIN');
    const { user } = await auth.register(rm);
    expect((await admin.update(actor.id, user.id, { active: false })).active).toBe(false);
    expect(await code(auth.login({ email: rm.email, password: TEST_PASSWORD }, 'ip'))).toBe(
      'UNAUTHENTICATED',
    );
  });

  it('refuses to let an admin demote or deactivate themselves', async () => {
    const { admin, seedUser } = createAuthKit();
    const me = await seedUser('ADMIN');
    await seedUser('ADMIN', 'second@bank.test');
    expect(await code(admin.update(me.id, me.id, { role: 'RM' }))).toBe('FORBIDDEN');
    expect(await code(admin.update(me.id, me.id, { active: false }))).toBe('FORBIDDEN');
  });

  it('never removes the last active admin', async () => {
    const { admin, seedUser } = createAuthKit();
    const a = await seedUser('ADMIN');
    const b = await seedUser('ADMIN', 'b@bank.test');
    await admin.update(a.id, b.id, { role: 'RM' });
    // `a` is now the only admin. Even a request from another actor cannot remove it.
    expect(await code(admin.update(b.id, a.id, { active: false }))).toBe('CONFLICT');
    expect(await code(admin.update(b.id, a.id, { role: 'RM' }))).toBe('CONFLICT');
  });

  it('returns NOT_FOUND for an unknown user', async () => {
    const { admin, seedUser } = createAuthKit();
    const actor = await seedUser('ADMIN');
    expect(await code(admin.update(actor.id, MISSING, { active: false }))).toBe('NOT_FOUND');
  });
});
