// Browser end-to-end tests (tests/e2e): the real web app and API, with the external forecast,
// explanation and price-history services replaced by test-only stubs (tests/e2e/support).
// Saved-profile persistence runs against a local Supabase when SUPABASE_TEST_URL and
// SUPABASE_TEST_SERVICE_ROLE_KEY are set (see docs/DATABASE_SCHEMA.md); otherwise the API runs with no
// database.
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const STUB = 4911;
const API = 4100;
const WEB = 3100;
const supabaseUrl = process.env.SUPABASE_TEST_URL ?? '';
const supabaseKey = supabaseUrl ? (process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? '') : '';
// Servers start from the repository root.
const root = resolve(import.meta.dirname, '../..');

const apiEnv: Record<string, string> = {
  NODE_ENV: 'test',
  API_PORT: String(API),
  // These journeys test the simulator, not sign-in; a developer's .env may enforce it.
  AUTH_ENFORCED: 'false',
  AI_API_URL: `http://127.0.0.1:${STUB}/v1`,
  AI_API_KEY: 'e2e',
  RAG_API_URL: `http://127.0.0.1:${STUB}/rag`,
  RAG_API_KEY: 'e2e',
  MARKET_HISTORY_PROVIDER: 'yahoo',
  MARKET_HISTORY_API_URL: `http://127.0.0.1:${STUB}/yahoo`,
  FINNHUB_API_KEY: '',
  UPSTOX_ACCESS_TOKEN: '',
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: supabaseKey,
};

export default defineConfig({
  testDir: '.',
  outputDir: resolve(root, 'test-results'),
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${WEB}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: [
    {
      command: 'node tests/e2e/support/stubServices.mjs',
      url: `http://127.0.0.1:${STUB}/health`,
      env: { E2E_STUB_PORT: String(STUB) },
      reuseExistingServer: false,
      cwd: root,
    },
    {
      command: 'npx tsx apps/api/src/server.ts',
      url: `http://127.0.0.1:${API}/api/health`,
      env: apiEnv,
      reuseExistingServer: false,
      cwd: root,
    },
    {
      command: `npm run dev --workspace @mindspark/web -- --port ${WEB} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB}`,
      env: { VITE_API_PROXY_TARGET: `http://127.0.0.1:${API}` },
      reuseExistingServer: false,
      cwd: root,
    },
  ],
});
