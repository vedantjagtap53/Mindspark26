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
import type { HistoryProvider } from '../services/market-data/history/yahooHistoryProvider.js';
import type { MarketDataService } from '../services/market-data/marketDataService.js';
import { createSimulateService } from '../services/simulation/simulateService.js';
import { createHealthRouter } from './healthRoutes.js';
import { createSimulateRouter } from './simulateRoutes.js';
import { createAdvisoryController } from '../controllers/advisoryController.js';
import { createAdvisoryService } from '../services/ai/advisoryService.js';
import type { RagClient } from '../services/ai/ragClient.js';
import type { SimulationRecords } from '../services/simulation/simulationRecords.js';
import { createPersistenceService } from '../services/persistence/persistenceService.js';
import type { Repositories } from '../repositories/interfaces/index.js';
import { createSuitabilityService } from '../services/suitability/suitabilityService.js';
import { createAdminController, createAuditController } from '../controllers/adminController.js';
import { createRunsController } from '../controllers/runsController.js';
import { createActivityLog } from '../services/activity/activityLog.js';
import { createAnalyticsService } from '../services/analytics/analyticsService.js';
import { createRunsService } from '../services/runs/runsService.js';
import { consoleLogger, type Logger } from '../utils/logger.js';
import { createAuthController } from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { createAuditService } from '../services/audit/auditService.js';
import { createAccessTokenSigner } from '../services/auth/accessToken.js';
import { createAuthService } from '../services/auth/authService.js';
import { createLoginThrottle } from '../services/auth/loginThrottle.js';
import { createPasswordHasher, type PasswordHasher } from '../services/auth/passwordHasher.js';
import { createUserAdminService } from '../services/auth/userAdminService.js';
import { createAdminRouter } from './adminRoutes.js';
import { createAuditRouter } from './auditRoutes.js';
import { createRunsRouter } from './runsRoutes.js';
import { createAuthRouter } from './authRoutes.js';

export interface ApiDeps {
  marketData: MarketDataService;
  /** Absent when the forecast service is not configured. */
  forecast?: ForecastClient;
  /** Runs kept for suitability, explain and chat. */
  records: SimulationRecords;
  /** Absent when the explanation/chat service is not configured. */
  rag?: RagClient;
  /** Daily closes for the Mode A fan chart; absent when MARKET_HISTORY_PROVIDER is none. */
  history?: HistoryProvider;
  /** Supabase repositories; absent when the database is not configured. */
  repositories?: Repositories;
  /** Password hashing; tests inject a cheap one. Defaults to scrypt at the production cost. */
  passwordHasher?: PasswordHasher;
  /** Where failures to write the activity log are reported. */
  logger?: Logger;
}

export function createApiRouter(config: AppConfig, deps: ApiDeps): Router {
  const router = Router();
  const { enforced } = config.auth;
  const signer = createAccessTokenSigner({
    secret: config.auth.jwtSecret,
    ttlSeconds: config.auth.accessTtlSeconds,
  });
  const hasher = deps.passwordHasher ?? createPasswordHasher();
  const activity = createActivityLog(deps.repositories, deps.logger ?? consoleLogger);
  router.use(authenticate(signer));

  router.use(
    API_ROUTES.health,
    createHealthRouter(createHealthController(createHealthService(config))),
  );
  router.use(
    API_ROUTES.auth,
    createAuthRouter(
      createAuthController(
        createAuthService({
          repositories: deps.repositories,
          hasher,
          signer,
          throttle: createLoginThrottle(),
          refreshTtlSeconds: config.auth.refreshTtlSeconds,
          activity,
        }),
        config,
      ),
    ),
  );
  router.use(
    API_ROUTES.admin,
    createAdminRouter(
      createAdminController(
        createUserAdminService({ repositories: deps.repositories, hasher, activity }),
        createAnalyticsService(deps.repositories),
      ),
    ),
  );
  router.use(
    API_ROUTES.audit,
    createAuditRouter(createAuditController(createAuditService(deps.repositories))),
  );
  router.use(
    API_ROUTES.runs,
    createRunsRouter(createRunsController(createRunsService(deps.repositories))),
  );

  router.use(
    API_ROUTES.configure,
    authorize('simulate:run', enforced),
    createConfigureRouter(createConfigureController(createConfigureService())),
  );
  router.use(
    API_ROUTES.simulate,
    authorize('simulate:run', enforced),
    createSimulateRouter(
      createSimulateController(
        createSimulateService({
          marketData: deps.marketData,
          forecast: deps.forecast,
          records: deps.records,
          history: deps.history,
        }),
      ),
    ),
  );

  const persistence = createPersistenceService(deps.repositories, activity);
  const advisory = createAdvisoryController(
    createSuitabilityService({
      records: deps.records,
      persistence,
      concentrationLimitPct: config.suitability.concentrationLimitPct,
    }),
    createAdvisoryService({ records: deps.records, persistence, rag: deps.rag }),
  );
  router.post(API_ROUTES.suitability, authorize('suitability:run', enforced), advisory.suitability);
  router.post(API_ROUTES.explain, authorize('explain:run', enforced), advisory.explain);
  router.post(API_ROUTES.chat, authorize('chat:use', enforced), advisory.chat);
  return router;
}
