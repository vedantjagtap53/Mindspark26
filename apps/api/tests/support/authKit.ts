// Test-only wiring of the auth services with in-memory repositories and a cheap scrypt cost.
import type { UserRole } from '@mindspark/shared';
import type { Repositories } from '../../src/repositories/interfaces/index.js';
import { createAccessTokenSigner } from '../../src/services/auth/accessToken.js';
import { createAuthService } from '../../src/services/auth/authService.js';
import { createLoginThrottle } from '../../src/services/auth/loginThrottle.js';
import { createPasswordHasher } from '../../src/services/auth/passwordHasher.js';
import { createUserAdminService } from '../../src/services/auth/userAdminService.js';
import { createMemoryRepositories } from './memoryRepositories.js';

export const TEST_SECRET = 't'.repeat(40);
export const TEST_PASSWORD = 'Valid-Passw0rd';
export const fastHasher = createPasswordHasher({ N: 1024, r: 8, p: 1 });

export function createAuthKit(repositories: Repositories = createMemoryRepositories()) {
  // Starts at real time: the in-memory repositories stamp revocations with the real clock.
  const clock = { now: Date.now() };
  const now = () => clock.now;
  const signer = createAccessTokenSigner({ secret: TEST_SECRET, ttlSeconds: 900, now });
  const throttle = createLoginThrottle(now);
  const auth = createAuthService({
    repositories,
    hasher: fastHasher,
    signer,
    throttle,
    refreshTtlSeconds: 604_800,
    now,
  });
  const admin = createUserAdminService({ repositories, hasher: fastHasher });

  /** Inserts a user straight into the repository, e.g. to get an ADMIN account. */
  const seedUser = async (role: UserRole, email = `${role.toLowerCase()}@bank.test`) =>
    repositories.users.create({
      email,
      displayName: `${role} user`,
      passwordHash: await fastHasher.hash(TEST_PASSWORD),
      role,
    });

  return { repositories, clock, signer, throttle, auth, admin, seedUser };
}
