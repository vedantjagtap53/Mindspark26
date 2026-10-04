import type { RequestHandler } from 'express';
import { z } from 'zod';
import {
  profileIdSchema,
  savedProfileInputSchema,
  type SavedProfile,
  type SavedProfileList,
} from '@mindspark/shared';
import type { ClientProfileService } from '../services/clientProfiles/clientProfileService.js';

export interface ClientProfileController {
  list: RequestHandler<unknown, SavedProfileList>;
  create: RequestHandler<unknown, SavedProfile>;
  get: RequestHandler<{ id: string }, SavedProfile>;
  update: RequestHandler<{ id: string }, SavedProfile>;
}

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// A ZodError thrown by a schema is mapped to VALIDATION_ERROR (400) by the error middleware.
export function createClientProfileController(
  service: ClientProfileService,
): ClientProfileController {
  return {
    list: async (req, res) => {
      res.json({ profiles: await service.list(pageSchema.parse(req.query)) });
    },
    create: async (req, res) => {
      res.status(201).json(await service.create(savedProfileInputSchema.parse(req.body)));
    },
    get: async (req, res) => {
      res.json(await service.get(profileIdSchema.parse(req.params.id)));
    },
    update: async (req, res) => {
      res.json(
        await service.update(
          profileIdSchema.parse(req.params.id),
          savedProfileInputSchema.parse(req.body),
        ),
      );
    },
  };
}
