import { Router } from 'express';
import type { RunsController } from '../controllers/runsController.js';
import { requirePermission } from '../middleware/authenticate.js';

/** Mounted at /api/runs. A signed-in account's own saved runs; needs the runs:read permission. */
export function createRunsRouter(controller: RunsController): Router {
  const router = Router();
  router.use(requirePermission('runs:read'));
  router.get('/', controller.listMine);
  router.get('/:id', controller.getMine);
  return router;
}
