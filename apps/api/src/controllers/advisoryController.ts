import type { RequestHandler } from 'express';
import {
  chatRequestSchema,
  explainRequestSchema,
  suitabilityRequestSchema,
  type ChatResponse,
  type ExplainResponse,
  type SuitabilityResponse,
} from '@mindspark/shared';
import type { AdvisoryService } from '../services/ai/advisoryService.js';
import type { SuitabilityService } from '../services/suitability/suitabilityService.js';

export interface AdvisoryController {
  suitability: RequestHandler<unknown, SuitabilityResponse>;
  explain: RequestHandler<unknown, ExplainResponse>;
  chat: RequestHandler<unknown, ChatResponse>;
}

// A ZodError thrown by a schema is mapped to VALIDATION_ERROR (400) by the error middleware.
export function createAdvisoryController(
  suitability: SuitabilityService,
  advisory: AdvisoryService,
): AdvisoryController {
  return {
    suitability: (req, res) => {
      res.json(suitability.assess(suitabilityRequestSchema.parse(req.body)));
    },
    explain: async (req, res) => {
      res.json(await advisory.explain(explainRequestSchema.parse(req.body).simulationId));
    },
    chat: async (req, res) => {
      res.json(await advisory.chat(chatRequestSchema.parse(req.body)));
    },
  };
}
