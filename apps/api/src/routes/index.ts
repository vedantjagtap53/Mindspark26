// Route registry: wires controller → service per capability. Later capabilities
// (configure, simulate, suitability, explain, chat) register here as they are built.
import { Router } from 'express';
import { API_ROUTES } from '@mindspark/shared';
import type { AppConfig } from '../config/index.js';
import { createHealthController } from '../controllers/healthController.js';
import { createHealthService } from '../services/health/healthService.js';
import { createConfigureController } from '../controllers/configureController.js';
import { createConfigureService } from '../services/configure/configureService.js';
import { createConfigureRouter } from './configureRoutes.js';
import { createSimulateController } from '../controllers/simulateController.js';
import type { ForecastClient } from '../services/ai/forecastClient.js';
import type { MarketDataService } from '../services/market-data/marketDataService.js';
import { createSimulateService } from '../services/simulation/simulateService.js';
import { createHealthRouter } from './healthRoutes.js';
import { createSimulateRouter } from './simulateRoutes.js';
import { createAdvisoryController } from '../controllers/advisoryController.js';
import { createAdvisoryService } from '../services/ai/advisoryService.js';
import type { RagClient } from '../services/ai/ragClient.js';
import type { SimulationRecords } from '../services/simulation/simulationRecords.js';
import { createSuitabilityService } from '../services/suitability/suitabilityService.js';

export interface ApiDeps {
  marketData: MarketDataService;
  /** Absent when the forecast service is not configured. */
  forecast?: ForecastClient;
  /** Runs kept for suitability, explain and chat. */
  records: SimulationRecords;
  /** Absent when the explanation/chat service is not configured. */
  rag?: RagClient;
}

export function createApiRouter(config: AppConfig, deps: ApiDeps): Router {
  const router = Router();
  const healthService = createHealthService(config);
  router.use(API_ROUTES.health, createHealthRouter(createHealthController(healthService)));
  router.use(
    API_ROUTES.configure,
    createConfigureRouter(createConfigureController(createConfigureService())),
  );
  router.use(
    API_ROUTES.simulate,
    createSimulateRouter(
      createSimulateController(
        createSimulateService({
          marketData: deps.marketData,
          forecast: deps.forecast,
          records: deps.records,
        }),
      ),
    ),
  );

  const advisory = createAdvisoryController(
    createSuitabilityService({
      records: deps.records,
      concentrationLimitPct: config.suitability.concentrationLimitPct,
    }),
    createAdvisoryService({ records: deps.records, rag: deps.rag }),
  );
  router.post(API_ROUTES.suitability, advisory.suitability);
  router.post(API_ROUTES.explain, advisory.explain);
  router.post(API_ROUTES.chat, advisory.chat);
  return router;
}
