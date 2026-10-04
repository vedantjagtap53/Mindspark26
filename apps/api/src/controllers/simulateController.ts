import type { RequestHandler } from 'express';
import {
  simulateModeARequestSchema,
  simulateModeBRequestSchema,
  type SimulateModeAResponse,
  type SimulateModeBResponse,
} from '@mindspark/shared';
import type { SimulateService } from '../services/simulation/simulateService.js';
import { AppError } from '../utils/errors.js';

export interface SimulateController {
  post: RequestHandler<unknown, SimulateModeAResponse | SimulateModeBResponse>;
}

export function createSimulateController(service: SimulateService): SimulateController {
  return {
    // A ZodError thrown by a schema is mapped to VALIDATION_ERROR (400) by the error middleware.
    post: async (req, res) => {
      const body = req.body as { mode?: unknown; productType?: unknown } | undefined;
      if (body?.mode === 'A') {
        if (body.productType === 'DCD') {
          throw new AppError(
            'NOT_IMPLEMENTED',
            'Mode A is not available for DCD (there is no FX forecast yet): use Mode B',
          );
        }
        res.json(await service.simulateModeA(simulateModeARequestSchema.parse(req.body)));
        return;
      }
      res.json(await service.simulateModeB(simulateModeBRequestSchema.parse(req.body)));
    },
  };
}
