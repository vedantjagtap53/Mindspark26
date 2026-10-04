import { Router } from 'express';
import type { SimulateController } from '../controllers/simulateController.js';

export function createSimulateRouter(controller: SimulateController): Router {
  const router = Router();
  router.post('/', controller.post);
  return router;
}
