// Creates the first admin (public registration can only create RMs).
//   ADMIN_EMAIL=a@bank.com ADMIN_PASSWORD='...' [ADMIN_NAME='Name'] npm run seed:admin
// Idempotent: an existing admin is left alone; an existing non-admin with that email is promoted.
import { fileURLToPath } from 'node:url';
import { createUserRequestSchema, passwordSchema } from '@mindspark/shared';
import { ConfigError, loadConfig, loadDotenv } from '../config/index.js';
import type { Repositories } from '../repositories/interfaces/index.js';
import { createSupabaseClient } from '../repositories/supabase/supabaseClient.js';
import { createSupabaseRepositories } from '../repositories/supabase/supabaseRepositories.js';
import { createPasswordHasher, type PasswordHasher } from '../services/auth/passwordHasher.js';

export type SeedAdminResult = 'created' | 'promoted' | 'unchanged';

export async function seedAdmin(
  repositories: Repositories,
  hasher: PasswordHasher,
  input: { email: string; password: string; displayName: string },
): Promise<SeedAdminResult> {
  // Same rules as an admin creating a user (strong password, clean name, but an official-sounding
  // label such as "Administrator" is allowed): a weak or malformed seed is refused, not stored.
  const parsed = createUserRequestSchema.parse({ ...input, role: 'ADMIN' });
  const existing = await repositories.users.getByEmail(parsed.email);
  if (existing) {
    if (existing.role === 'ADMIN' && existing.active) return 'unchanged';
    await repositories.users.update(existing.id, { role: 'ADMIN', active: true });
    return 'promoted';
  }
  await repositories.users.create({
    email: parsed.email,
    displayName: parsed.displayName,
    passwordHash: await hasher.hash(parsed.password),
    role: 'ADMIN',
  });
  return 'created';
}

async function main(): Promise<void> {
  loadDotenv();
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (and optionally ADMIN_NAME).');
    process.exit(1);
  }
  const strength = passwordSchema.safeParse(ADMIN_PASSWORD);
  if (!strength.success) {
    console.error(`ADMIN_PASSWORD: ${strength.error.issues.map((i) => i.message).join('; ')}`);
    process.exit(1);
  }
  const config = loadConfig();
  if (!config.database.configured) {
    console.error('Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const repositories = createSupabaseRepositories(createSupabaseClient(config.database));
  const result = await seedAdmin(repositories, createPasswordHasher(), {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    displayName: ADMIN_NAME ?? 'Administrator',
  });
  console.log(`Admin ${ADMIN_EMAIL.toLowerCase()}: ${result}`);
}

// Run only when executed directly, so tests can import seedAdmin.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    console.error(err instanceof ConfigError ? err.message : err);
    process.exit(1);
  });
}
