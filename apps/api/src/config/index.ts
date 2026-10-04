// Centralized, typed application configuration. Everything else receives an AppConfig;
// nothing outside src/config reads process.env.
import type { RuntimeEnvironment } from '@mindspark/shared';
import { FIREBASE_REQUIRED, parseEnv, type Env } from './env.js';

export interface AppConfig {
  env: RuntimeEnvironment;
  port: number;
  /** Firebase SQL Connect, the only database. Credentials are read only by its adapter. */
  database: {
    configured: boolean;
    projectId?: string;
    serviceId?: string;
    location?: string;
    clientEmail?: string;
    privateKey?: string;
    emulatorHost?: string;
  };
  ai: {
    baseUrl?: string;
    apiKey?: string;
    forecastTimeoutMs: number;
    /** Explanation and chat service (services/rag). */
    rag: { baseUrl?: string; apiKey?: string; timeoutMs: number };
  };
  suitability: { concentrationLimitPct: number };
  marketData: {
    apiKey?: string;
    finnhub: { apiKey?: string; wsUrl: string };
    upstox: { accessToken?: string; apiUrl: string };
    /** Maximum age of a live price, in seconds. */
    maxAgeSeconds: number;
    fx: { apiUrl: string; maxAgeDays: number };
    /** Daily closes for the fan chart; `none` disables it. */
    history: { provider: 'none' | 'yahoo'; apiUrl: string };
  };
}

export function buildConfig(env: Env): AppConfig {
  return {
    env: env.NODE_ENV,
    port: env.API_PORT,
    database: {
      configured: FIREBASE_REQUIRED.every((name) => Boolean(env[name])),
      projectId: env.FIREBASE_PROJECT_ID,
      serviceId: env.FIREBASE_SQL_CONNECT_SERVICE_ID,
      location: env.FIREBASE_SQL_CONNECT_LOCATION,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY,
      emulatorHost: env.DATA_CONNECT_EMULATOR_HOST,
    },
    ai: {
      baseUrl: env.AI_API_URL,
      apiKey: env.AI_API_KEY,
      forecastTimeoutMs: env.AI_FORECAST_TIMEOUT_MS,
      rag: { baseUrl: env.RAG_API_URL, apiKey: env.RAG_API_KEY, timeoutMs: env.RAG_TIMEOUT_MS },
    },
    suitability: { concentrationLimitPct: env.SUITABILITY_CONCENTRATION_LIMIT_PCT },
    marketData: {
      apiKey: env.MARKET_DATA_API_KEY,
      finnhub: { apiKey: env.FINNHUB_API_KEY, wsUrl: env.FINNHUB_WS_URL },
      upstox: { accessToken: env.UPSTOX_ACCESS_TOKEN, apiUrl: env.UPSTOX_API_URL },
      maxAgeSeconds: env.MARKET_DATA_MAX_AGE_SECONDS,
      fx: { apiUrl: env.FX_API_URL, maxAgeDays: env.FX_RATE_MAX_AGE_DAYS },
      history: { provider: env.MARKET_HISTORY_PROVIDER, apiUrl: env.MARKET_HISTORY_API_URL },
    },
  };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return buildConfig(parseEnv(source));
}

export { ConfigError, loadDotenv } from './env.js';
