import type { RequestHandler } from 'express';
import type { HealthResponse } from '@mindspark/shared';
import type { HealthService } from '../services/health/healthService.js';

export interface HealthController {
  get: RequestHandler<unknown, HealthResponse>;
}

export function createHealthController(service: HealthService): HealthController {
  return {
    get: (_req, res) => {
      res.json(service.getHealth());
    },
  };
}
