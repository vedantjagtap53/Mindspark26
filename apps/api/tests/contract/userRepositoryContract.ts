// Behaviour every user / refresh-token repository must have. Runs against the in-memory
// implementation and against the Supabase adapter on a local database (tests/supabase).
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_USER_SETTINGS } from '@mindspark/shared';
import {
  RepositoryError,
  type Repositories,
  type UserInput,
} from '../../src/repositories/interfaces/index.js';

const MISSING = '00000000-0000-4000-8000-000000000000';
let counter = 0;
const userInput = (over: Partial<UserInput> = {}): UserInput => ({
  email: `rm${++counter}-${Date.now()}@bank.test`,
  displayName: 'Asha Rao',
  passwordHash: 'scrypt$hash',
  role: 'RM',
  ...over,
});
const hash = () => `${'a'.repeat(32)}${(++counter).toString(16).padStart(32, '0')}`;
const future = () => new Date(Date.now() + 3_600_000).toISOString();

export function runUserRepositoryContract(
  name: string,
  setup: () => Promise<Pick<Repositories, 'users' | 'refreshTokens'>>,
) {
  describe(`user repositories: ${name}`, () => {
    let repos: Pick<Repositories, 'users' | 'refreshTokens'>;
    beforeEach(async () => {
      repos = await setup();
    });

    it('creates a user with defaults and reads it back by id and email', async () => {
      const input = userInput();
      const created = await repos.users.create(input);
      expect(created).toMatchObject({
        email: input.email,
        displayName: 'Asha Rao',
        role: 'RM',
        active: true,
        settings: DEFAULT_USER_SETTINGS,
        lastLoginAt: null,
      });
      expect(await repos.users.getById(created.id)).toEqual(created);
      expect(await repos.users.getByEmail(input.email.toUpperCase())).toEqual(created);
    });

    it('matches an email exactly: LIKE wildcards in an address are plain characters', async () => {
      const stamp = Date.now();
      const underscore = await repos.users.create(
        userInput({ email: 'a_b' + stamp + '@bank.test' }),
      );
      const lookalike = await repos.users.create(
        userInput({ email: 'axb' + stamp + '@bank.test' }),
      );
      const percent = await repos.users.create(userInput({ email: '100%' + stamp + '@bank.test' }));
      expect((await repos.users.getByEmail('a_b' + stamp + '@bank.test'))?.id).toBe(underscore.id);
      expect((await repos.users.getByEmail('axb' + stamp + '@bank.test'))?.id).toBe(lookalike.id);
      expect((await repos.users.getByEmail('100%' + stamp + '@bank.test'))?.id).toBe(percent.id);
      expect(await repos.users.getByEmail('%' + stamp + '@bank.test')).toBeNull();
      expect(await repos.users.getByEmail('a_' + stamp + '@bank.test')).toBeNull();
    });

    it('returns null for unknown users', async () => {
      expect(await repos.users.getById(MISSING)).toBeNull();
      expect(await repos.users.getByEmail('nobody@bank.test')).toBeNull();
      expect(await repos.users.update(MISSING, { active: false })).toBeNull();
    });

    it('rejects a duplicate email, ignoring case', async () => {
      const input = userInput();
      await repos.users.create(input);
      const err = await repos.users
        .create({ ...input, email: input.email.toUpperCase() })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RepositoryError);
      expect((err as RepositoryError).kind).toBe('conflict');
    });

    it('updates role, active flag, settings and last login', async () => {
      const { id } = await repos.users.create(userInput());
      const at = new Date().toISOString();
      const updated = await repos.users.update(id, {
        role: 'ADMIN',
        active: false,
        settings: { theme: 'dark', customCursor: false },
        lastLoginAt: at,
      });
      expect(updated).toMatchObject({
        role: 'ADMIN',
        active: false,
        settings: { theme: 'dark', customCursor: false },
      });
      expect(updated?.lastLoginAt).toBe(new Date(at).toISOString());
    });

    it('lists users oldest first and counts active users per role', async () => {
      const a = await repos.users.create(userInput({ role: 'ADMIN' }));
      const b = await repos.users.create(userInput({ role: 'ADMIN' }));
      const listed = (await repos.users.list()).map((u) => u.id);
      expect(listed.indexOf(a.id)).toBeLessThan(listed.indexOf(b.id));
      const before = await repos.users.countActiveByRole('ADMIN');
      await repos.users.update(b.id, { active: false });
      expect(await repos.users.countActiveByRole('ADMIN')).toBe(before - 1);
    });

    it('stores a refresh token, finds it by hash and rejects a duplicate hash', async () => {
      const { id: userId } = await repos.users.create(userInput());
      const input = { userId, familyId: randomUUID(), tokenHash: hash(), expiresAt: future() };
      const token = await repos.refreshTokens.create(input);
      expect(token).toMatchObject({ userId, revokedAt: null, replacedBy: null });
      expect(await repos.refreshTokens.getByHash(input.tokenHash)).toEqual(token);
      expect(await repos.refreshTokens.getByHash(hash())).toBeNull();
      await expect(repos.refreshTokens.create(input)).rejects.toMatchObject({ kind: 'conflict' });
    });

    it('rejects a refresh token for an unknown user', async () => {
      await expect(
        repos.refreshTokens.create({
          userId: MISSING,
          familyId: randomUUID(),
          tokenHash: hash(),
          expiresAt: future(),
        }),
      ).rejects.toMatchObject({ kind: 'invalid_reference' });
    });

    it('rotates a token once and links its successor', async () => {
      const { id: userId } = await repos.users.create(userInput());
      const familyId = randomUUID();
      const first = await repos.refreshTokens.create({
        userId,
        familyId,
        tokenHash: hash(),
        expiresAt: future(),
      });
      const second = await repos.refreshTokens.create({
        userId,
        familyId,
        tokenHash: hash(),
        expiresAt: future(),
      });
      await repos.refreshTokens.rotate(first.id, second.id);
      const rotated = await repos.refreshTokens.getByHash(first.tokenHash);
      expect(rotated?.revokedAt).not.toBeNull();
      expect(rotated?.replacedBy).toBe(second.id);
      expect((await repos.refreshTokens.getByHash(second.tokenHash))?.revokedAt).toBeNull();
    });

    it('revokes a whole family, or every token of a user', async () => {
      const { id: userId } = await repos.users.create(userInput());
      const family = randomUUID();
      const mk = (familyId: string) =>
        repos.refreshTokens.create({ userId, familyId, tokenHash: hash(), expiresAt: future() });
      const a = await mk(family);
      const b = await mk(family);
      const c = await mk(randomUUID());
      await repos.refreshTokens.revokeFamily(family);
      expect((await repos.refreshTokens.getByHash(a.tokenHash))?.revokedAt).not.toBeNull();
      expect((await repos.refreshTokens.getByHash(b.tokenHash))?.revokedAt).not.toBeNull();
      expect((await repos.refreshTokens.getByHash(c.tokenHash))?.revokedAt).toBeNull();
      await repos.refreshTokens.revokeAllForUser(userId);
      expect((await repos.refreshTokens.getByHash(c.tokenHash))?.revokedAt).not.toBeNull();
    });
  });
}
