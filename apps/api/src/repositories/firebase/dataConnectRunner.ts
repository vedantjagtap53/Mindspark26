// The only place that talks to the Firebase SDK. Runs the *named* operations defined in
// dataconnect/connector (connector "backend") with admin credentials; it never sends ad-hoc
// GraphQL, so the connector's "no delete operations" rule cannot be bypassed from the app.

import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getDataConnect } from 'firebase-admin/data-connect';
import type { AppConfig } from '../../config/index.js';
import { RepositoryError } from '../interfaces/index.js';

export const CONNECTOR_ID = 'backend';
const APP_NAME = 'mindspark-sql-connect';

export type OperationVariables = Record<string, unknown>;

export interface OperationRunner {
  query<T>(name: string, variables: OperationVariables): Promise<T>;
  mutation<T>(name: string, variables: OperationVariables): Promise<T>;
}

/** Maps any SDK or network failure to a database-neutral RepositoryError. */
export function toRepositoryError(err: unknown): RepositoryError {
  if (err instanceof RepositoryError) return err;
  const code = (err as { code?: unknown } | null)?.code;
  const message = err instanceof Error ? err.message : String(err);
  if (typeof code === 'string' && code.startsWith('data-connect/')) {
    if (/unique constraint/i.test(message)) {
      return new RepositoryError('conflict', `Duplicate value: ${message}`);
    }
    if (/foreign key constraint/i.test(message)) {
      return new RepositoryError('invalid_reference', `Referenced record not found: ${message}`);
    }
    if (/unauthenticated|permission-denied|invalid-credential/.test(code)) {
      return new RepositoryError('unavailable', 'Firebase rejected the service credentials');
    }
    return new RepositoryError('unavailable', `Database operation failed: ${message}`);
  }
  // Network failures surface as plain errors (the SDK cannot build an error without a response).
  return new RepositoryError('unavailable', 'Firebase SQL Connect is unreachable');
}

function firebaseApp(db: AppConfig['database']): App {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  const credential =
    db.clientEmail && db.privateKey
      ? cert({
          projectId: db.projectId,
          clientEmail: db.clientEmail,
          // Keys stored in .env files usually carry escaped newlines.
          privateKey: db.privateKey.replace(/\\n/g, '\n'),
        })
      : applicationDefault();
  return initializeApp({ projectId: db.projectId, credential }, APP_NAME);
}

export function createDataConnectRunner(db: AppConfig['database']): OperationRunner {
  if (!db.configured || !db.serviceId || !db.location) {
    throw new RepositoryError(
      'not_configured',
      'Firebase SQL Connect is not configured (FIREBASE_PROJECT_ID, FIREBASE_SQL_CONNECT_SERVICE_ID, FIREBASE_SQL_CONNECT_LOCATION)',
    );
  }
  if (db.emulatorHost) {
    // firebase-admin reads the emulator address from the environment and expects host:port only.
    process.env.DATA_CONNECT_EMULATOR_HOST = db.emulatorHost.replace(/^https?:\/\//, '');
  }
  const dc = getDataConnect(
    { serviceId: db.serviceId, location: db.location, connector: CONNECTOR_ID },
    firebaseApp(db),
  );
  return {
    async query<T>(name: string, variables: OperationVariables) {
      try {
        return (await dc.executeQuery<T, OperationVariables>(name, variables)).data;
      } catch (err) {
        throw toRepositoryError(err);
      }
    },
    async mutation<T>(name: string, variables: OperationVariables) {
      try {
        return (await dc.executeMutation<T, OperationVariables>(name, variables)).data;
      } catch (err) {
        throw toRepositoryError(err);
      }
    },
  };
}
