import { Router } from 'express';
import type { AuthController } from '../controllers/authController.js';
import { requireUser } from '../middleware/authenticate.js';

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();
  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', controller.me);
  router.put('/settings', requireUser, controller.updateSettings);
  return router;
}
