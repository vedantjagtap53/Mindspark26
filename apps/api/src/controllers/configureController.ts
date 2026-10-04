import type { RequestHandler } from 'express';
import { configureRequestSchema, type ConfigureResponse } from '@mindspark/shared';
import type { ConfigureService } from '../services/configure/configureService.js';

export interface ConfigureController {
  post: RequestHandler<unknown, ConfigureResponse>;
}

export function createConfigureController(service: ConfigureService): ConfigureController {
  return {
    // A ZodError thrown here is mapped to VALIDATION_ERROR (400) by the error middleware.
    post: (req, res) => {
      res.json(service.configure(configureRequestSchema.parse(req.body)));
    },
  };
}
