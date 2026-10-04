// The repository contract against the real SQL Connect emulator. Skipped unless the emulator is
// running (see DATABASE_SCHEMA.md, "Testing against the emulator").
import { getApps } from 'firebase-admin/app';
import { getDataConnect } from 'firebase-admin/data-connect';
import { describe } from 'vitest';
import { buildConfig } from '../../src/config/index.js';
import { parseEnv } from '../../src/config/env.js';
import { createDataConnectRunner } from '../../src/repositories/firebase/dataConnectRunner.js';
import { createFirebaseRepositories } from '../../src/repositories/firebase/firebaseRepositories.js';
import { runRepositoryContract } from '../contract/repositoryContract.js';
import { runPersistenceFlow } from './persistenceFlow.js';

const emulatorHost =
  process.env.FIREBASE_DATA_CONNECT_EMULATOR_HOST ?? process.env.DATA_CONNECT_EMULATOR_HOST;

const config = buildConfig(
  parseEnv({
    FIREBASE_PROJECT_ID: process.env.FDC_TEST_PROJECT_ID ?? 'demo-mindspark',
    FIREBASE_SQL_CONNECT_SERVICE_ID: process.env.FDC_TEST_SERVICE_ID ?? 'mindspark',
    FIREBASE_SQL_CONNECT_LOCATION: process.env.FDC_TEST_LOCATION ?? 'asia-south1',
    DATA_CONNECT_EMULATOR_HOST: emulatorHost,
  }),
);
const db = config.database;

/** Test-only: empties every table. Refuses to run anywhere but the emulator. */
async function resetEmulatorDatabase(): Promise<void> {
  if (!process.env.DATA_CONNECT_EMULATOR_HOST) {
    throw new Error('Refusing to reset: not connected to the SQL Connect emulator');
  }
  const app = getApps().find((a) => a.name === 'mindspark-sql-connect');
  const dc = getDataConnect({ serviceId: db.serviceId!, location: db.location! }, app);
  await dc.executeGraphql(`mutation ResetForTests {
    e: _execute(sql: "DELETE FROM explanations")
    s: _execute(sql: "DELETE FROM suitability_results")
    r: _execute(sql: "DELETE FROM risk_results")
    m: _execute(sql: "DELETE FROM simulations")
    c: _execute(sql: "DELETE FROM product_configurations")
    p: _execute(sql: "DELETE FROM client_profiles")
  }`);
}

describe.skipIf(!emulatorHost)('Firebase SQL Connect adapter (emulator)', () => {
  runRepositoryContract('Firebase SQL Connect (emulator)', async () => {
    const repos = createFirebaseRepositories(createDataConnectRunner(db));
    await resetEmulatorDatabase();
    return repos;
  });
});

describe.skipIf(!emulatorHost)('persistence through the app (emulator)', () => {
  runPersistenceFlow(config);
});
