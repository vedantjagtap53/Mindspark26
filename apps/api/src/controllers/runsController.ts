import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { SavedRunResponse, SavedRunsResponse } from '@mindspark/shared';
import type { RunsService } from '../services/runs/runsService.js';

export interface RunsController {
  listMine: RequestHandler<unknown, SavedRunsResponse>;
  getMine: RequestHandler<{ id: string }, SavedRunResponse>;
}

const limitSchema = z.coerce.number().int().min(1).optional();

export function createRunsController(service: RunsService): RunsController {
  return {
    // The account comes from the verified session, never from the request.
    listMine: async (req, res) => {
      const limit = limitSchema.parse(req.query.limit);
      res.json({ runs: await service.mine(req.auth!.userId, limit) });
    },
    getMine: async (req, res) => {
      res.json({ run: await service.one(req.auth!.userId, req.params.id) });
    },
  };
}
