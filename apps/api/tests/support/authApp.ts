// Test-only: an app with auth wired to in-memory repositories and a cheap password hasher.
import { createHash } from 'node:crypto';
import request from 'supertest';
import type { UserRole } from '@mindspark/shared';
import { createApp } from '../../src/app.js';
import { buildConfig } from '../../src/config/index.js';
import { parseEnv } from '../../src/config/env.js';
import { silentLogger } from '../../src/utils/logger.js';
import { TEST_PASSWORD, TEST_SECRET, fastHasher, createAuthKit } from './authKit.js';
import { createMemoryRepositories } from './memoryRepositories.js';

export const sha256 = (body: string) => createHash('sha256').update(body).digest('hex');

export function createAuthApp(env: NodeJS.ProcessEnv = {}) {
  const repositories = createMemoryRepositories();
  const config = buildConfig(
    parseEnv({
      AUTH_JWT_SECRET: TEST_SECRET,
      AUTH_ENFORCED: 'true',
      AUTH_COOKIE_SECURE: 'false',
      ...env,
    }),
  );
  const app = createApp(config, silentLogger, { repositories, passwordHasher: fastHasher });
  const kit = createAuthKit(repositories);

  /** A supertest agent (keeps cookies) signed in as a user of the given role. */
  const signedIn = async (role: UserRole, email = `${role.toLowerCase()}@bank.test`) => {
    await kit.seedUser(role, email);
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    if (res.status !== 200) throw new Error(`login failed: ${res.status} ${res.text}`);
    return agent;
  };

  return { app, repositories, config, kit, signedIn };
}
