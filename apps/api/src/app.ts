import express, { type Express } from 'express';
import { API_BASE_PATH } from '@mindspark/shared';
import type { AppConfig } from './config/index.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { verifyPayloadHash } from './middleware/payloadHash.js';
import { createApiRouter, type ApiDeps } from './routes/index.js';
import { createForecastClient, type ForecastClient } from './services/ai/forecastClient.js';
import { createRagClient, type RagClient } from './services/ai/ragClient.js';
import type { Repositories } from './repositories/interfaces/index.js';
import { createSupabaseClient } from './repositories/supabase/supabaseClient.js';
import { createSupabaseRepositories } from './repositories/supabase/supabaseRepositories.js';
import {
  createYahooHistoryProvider,
  type HistoryProvider,
} from './services/market-data/history/yahooHistoryProvider.js';
import { createMarketData } from './services/market-data/createMarketData.js';
import { createMemorySimulationRecords } from './services/simulation/simulationRecords.js';
import { consoleLogger, type Logger } from './utils/logger.js';

export const JSON_BODY_LIMIT = '1mb';

/** Forecast client for Mode A, or `undefined` when AI_API_URL is not set. */
function forecastClientFromConfig(config: AppConfig): ForecastClient | undefined {
  const { baseUrl, apiKey, forecastTimeoutMs, forecastCacheMs } = config.ai;
  return baseUrl
    ? createForecastClient({
        baseUrl,
        apiKey: apiKey ?? '',
        timeoutMs: forecastTimeoutMs,
        cacheMs: forecastCacheMs,
      })
    : undefined;
}

/** Explanation/chat client, or `undefined` when RAG_API_URL is not set. */
function ragClientFromConfig(config: AppConfig): RagClient | undefined {
  const { baseUrl, apiKey, timeoutMs } = config.ai.rag;
  return baseUrl ? createRagClient({ baseUrl, apiKey, timeoutMs }) : undefined;
}

/** Supabase repositories, or `undefined` when the database is not configured. */
function repositoriesFromConfig(config: AppConfig): Repositories | undefined {
  return config.database.configured
    ? createSupabaseRepositories(createSupabaseClient(config.database))
    : undefined;
}

/** Fan-chart history provider, or `undefined` when MARKET_HISTORY_PROVIDER is none. */
function historyFromConfig(config: AppConfig): HistoryProvider | undefined {
  const { provider, apiUrl } = config.marketData.history;
  return provider === 'yahoo' ? createYahooHistoryProvider({ apiUrl }) : undefined;
}

/** `deps` lets the server own the market-data connection (to close it on shutdown) and tests inject fakes. */
export function createApp(
  config: AppConfig,
  logger: Logger = consoleLogger,
  deps: Partial<ApiDeps> = {},
): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    express.json({
      limit: JSON_BODY_LIMIT,
      // Keep the exact bytes: the payload hash is computed over them, not over re-serialized JSON.
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(API_BASE_PATH, verifyPayloadHash({ required: config.auth.payloadHashRequired }));
  app.use(
    API_BASE_PATH,
    createApiRouter(config, {
      marketData: deps.marketData ?? createMarketData(config, logger).service,
      forecast: 'forecast' in deps ? deps.forecast : forecastClientFromConfig(config),
      records: deps.records ?? createMemorySimulationRecords(),
      rag: 'rag' in deps ? deps.rag : ragClientFromConfig(config),
      history: 'history' in deps ? deps.history : historyFromConfig(config),
      repositories: 'repositories' in deps ? deps.repositories : repositoriesFromConfig(config),
      passwordHasher: deps.passwordHasher,
      logger,
    }),
  );
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
