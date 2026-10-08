import { Router } from 'express';
import type { AuditController } from '../controllers/adminController.js';
import { requirePermission } from '../middleware/authenticate.js';

/** Mounted at /api/audit. Read-only; needs the audit:read permission. */
export function createAuditRouter(controller: AuditController): Router {
  const router = Router();
  router.use(requirePermission('audit:read'));
  router.get('/simulations', controller.listSimulations);
  router.get('/simulations/:id', controller.getSimulation);
  return router;
}
