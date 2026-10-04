import { Router } from 'express';
import type { ConfigureController } from '../controllers/configureController.js';

export function createConfigureRouter(controller: ConfigureController): Router {
  const router = Router();
  router.post('/', controller.post);
  return router;
}
