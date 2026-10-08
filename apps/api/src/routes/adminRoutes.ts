import { Router } from 'express';
import type { AdminController } from '../controllers/adminController.js';
import { requirePermission } from '../middleware/authenticate.js';

/** Mounted at /api/admin. Everything here needs the users:manage permission. */
export function createAdminRouter(controller: AdminController): Router {
  const router = Router();
  router.use(requirePermission('users:manage'));
  router.get('/users', controller.listUsers);
  router.post('/users', controller.createUser);
  router.put('/users/:id', controller.updateUser);
  router.get('/analytics', controller.analytics);
  router.get('/activity', controller.activity);
  return router;
}
