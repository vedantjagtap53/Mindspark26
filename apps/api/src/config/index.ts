// Centralized, typed application configuration. Everything else receives an AppConfig;
// nothing outside src/config reads process.env.
import { randomBytes } from 'node:crypto';
import type { RuntimeEnvironment } from '@mindspark/shared';
import { SUPABASE_REQUIRED, parseEnv, type Env } from './env.js';

export interface AppConfig {
  env: RuntimeEnvironment;
  port: number;
  /** Supabase, the only database. The key is read only by its adapter. */
  database: {
    configured: boolean;
    url?: string;
    serviceRoleKey?: string;
  };
  auth: {
    /** HS256 signing secret for access tokens. */
    jwtSecret: string;
    /** True when no AUTH_JWT_SECRET was set: the secret is random and sessions end on restart. */
    jwtSecretEphemeral: boolean;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
    /** Anonymous requests are rejected when true. */
    enforced: boolean;
    payloadHashRequired: boolean;
    cookieSecure: boolean;
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
  const production = env.NODE_ENV === 'production';
  return {
    env: env.NODE_ENV,
    port: env.API_PORT,
    database: {
      configured: SUPABASE_REQUIRED.every((name) => Boolean(env[name])),
      url: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
    auth: {
      jwtSecret: env.AUTH_JWT_SECRET ?? randomBytes(32).toString('hex'),
      jwtSecretEphemeral: env.AUTH_JWT_SECRET === undefined,
      accessTtlSeconds: env.AUTH_ACCESS_TTL_SECONDS,
      refreshTtlSeconds: env.AUTH_REFRESH_TTL_SECONDS,
      enforced: env.AUTH_ENFORCED ?? production,
      payloadHashRequired: env.PAYLOAD_HASH_REQUIRED ?? production,
      cookieSecure: env.AUTH_COOKIE_SECURE ?? production,
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
