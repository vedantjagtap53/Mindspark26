import type { RequestHandler } from 'express';
import {
  simulateModeARequestSchema,
  simulateModeBRequestSchema,
  type SimulateModeAContextResponse,
  type SimulateModeAResponse,
  type SimulateModeBResponse,
} from '@mindspark/shared';
import type { SimulateService } from '../services/simulation/simulateService.js';

export interface SimulateController {
  post: RequestHandler<
    unknown,
    SimulateModeAResponse | SimulateModeAContextResponse | SimulateModeBResponse
  >;
}

export function createSimulateController(service: SimulateService): SimulateController {
  return {
    // A ZodError thrown by a schema is mapped to VALIDATION_ERROR (400) by the error middleware.
    post: async (req, res) => {
      const body = req.body as { mode?: unknown } | undefined;
      if (body?.mode === 'A') {
        res.json(
          await service.simulateModeA(simulateModeARequestSchema.parse(req.body), req.auth?.userId),
        );
        return;
      }
      res.json(
        await service.simulateModeB(simulateModeBRequestSchema.parse(req.body), req.auth?.userId),
      );
    },
  };
}
