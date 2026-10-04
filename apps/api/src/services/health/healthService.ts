import type { HealthResponse } from '@mindspark/shared';
import type { AppConfig } from '../../config/index.js';

export interface HealthService {
  getHealth(): HealthResponse;
}

/** Reports liveness and configuration status only. Exposes booleans, never credentials. */
export function createHealthService(
  config: AppConfig,
  now: () => Date = () => new Date(),
  uptime: () => number = () => process.uptime(),
): HealthService {
  return {
    getHealth() {
      return {
        status: 'ok',
        environment: config.env,
        timestamp: now().toISOString(),
        uptimeSeconds: Math.floor(uptime()),
        database: { provider: 'supabase', configured: config.database.configured },
      };
    },
  };
}
