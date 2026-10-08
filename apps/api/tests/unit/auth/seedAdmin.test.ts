import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { seedAdmin } from '../../../src/cli/seedAdmin.js';
import { TEST_PASSWORD, fastHasher } from '../../support/authKit.js';
import { createMemoryRepositories } from '../../support/memoryRepositories.js';

const input = { email: 'Boss@Bank.test', password: TEST_PASSWORD, displayName: 'The Boss' };

describe('seedAdmin', () => {
  it('creates an active admin with a hashed password and a lower-cased email', async () => {
    const repos = createMemoryRepositories();
    expect(await seedAdmin(repos, fastHasher, input)).toBe('created');
    const user = await repos.users.getByEmail('boss@bank.test');
    expect(user).toMatchObject({ role: 'ADMIN', active: true, email: 'boss@bank.test' });
    expect(await fastHasher.verify(TEST_PASSWORD, user!.passwordHash)).toBe(true);
  });

  it('accepts the default "Administrator" label, which public sign-up would refuse', async () => {
    const repos = createMemoryRepositories();
    const label = { ...input, displayName: 'Administrator' };
    expect(await seedAdmin(repos, fastHasher, label)).toBe('created');
    expect(await repos.users.getByEmail('boss@bank.test')).toMatchObject({
      displayName: 'Administrator',
      role: 'ADMIN',
    });
  });

  it('is idempotent for an existing admin', async () => {
    const repos = createMemoryRepositories();
    await seedAdmin(repos, fastHasher, input);
    expect(await seedAdmin(repos, fastHasher, input)).toBe('unchanged');
    expect(await repos.users.list()).toHaveLength(1);
  });

  it('promotes and reactivates an existing non-admin', async () => {
    const repos = createMemoryRepositories();
    const rm = await repos.users.create({
      email: 'boss@bank.test',
      displayName: 'Boss',
      passwordHash: 'x',
      role: 'RM',
    });
    await repos.users.update(rm.id, { active: false });
    expect(await seedAdmin(repos, fastHasher, input)).toBe('promoted');
    expect(await repos.users.getById(rm.id)).toMatchObject({ role: 'ADMIN', active: true });
  });

  it('refuses a weak password or a malformed email', async () => {
    const repos = createMemoryRepositories();
    await expect(
      seedAdmin(repos, fastHasher, { ...input, password: 'weak' }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(seedAdmin(repos, fastHasher, { ...input, email: 'nope' })).rejects.toBeInstanceOf(
      ZodError,
    );
    expect(await repos.users.list()).toHaveLength(0);
  });
});
