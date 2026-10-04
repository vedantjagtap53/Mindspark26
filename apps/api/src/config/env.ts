// Environment parsing and validation. This is the only place raw process.env is interpreted.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

// `.env.example` ships empty values (`KEY=`); treat them as unset.
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const unsetIfEmpty = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema);
const optional = <T extends z.ZodType>(schema: T) => unsetIfEmpty(schema.optional());

/** Firebase SQL Connect settings that must all be present for the database to be usable. */
export const FIREBASE_REQUIRED = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_SQL_CONNECT_SERVICE_ID',
  'FIREBASE_SQL_CONNECT_LOCATION',
] as const;

const envSchema = z
  .object({
    NODE_ENV: unsetIfEmpty(z.enum(['development', 'test', 'production']).default('development')),
    API_PORT: unsetIfEmpty(z.coerce.number().int().min(1).max(65535).default(4000)),

    // Firebase SQL Connect, the only database. Service-account credentials are optional
    // (Application Default Credentials are used when both are empty).
    FIREBASE_PROJECT_ID: optional(z.string()),
    FIREBASE_SQL_CONNECT_SERVICE_ID: optional(z.string()),
    FIREBASE_SQL_CONNECT_LOCATION: optional(z.string()),
    FIREBASE_CLIENT_EMAIL: optional(z.string()),
    FIREBASE_PRIVATE_KEY: optional(z.string()),
    // Local SQL Connect emulator, e.g. 127.0.0.1:9399.
    DATA_CONNECT_EMULATOR_HOST: optional(z.string()),

    AI_API_URL: optional(z.url()),
    AI_API_KEY: optional(z.string()),
    AI_FORECAST_TIMEOUT_MS: unsetIfEmpty(z.coerce.number().int().positive().default(15_000)),
    // Explanation and chat service (services/rag). RAG_API_KEY is sent as X-API-Key and must
    // equal that service's SERVICE_API_KEY.
    RAG_API_URL: optional(z.url()),
    RAG_API_KEY: optional(z.string()),
    RAG_TIMEOUT_MS: unsetIfEmpty(z.coerce.number().int().positive().default(90_000)),
    // Suitability: concentration above this percent is flagged (decided 2026-10-04).
    SUITABILITY_CONCENTRATION_LIMIT_PCT: unsetIfEmpty(
      z.coerce.number().min(0).max(100).default(25),
    ),
    MARKET_DATA_API_KEY: optional(z.string()),

    // Live level (MVP): Finnhub real-time trades over WebSocket. Takes precedence over Upstox.
    FINNHUB_API_KEY: optional(z.string()),
    FINNHUB_WS_URL: unsetIfEmpty(z.url().default('wss://ws.finnhub.io')),
    // Live level (future scope): Upstox market data feed, used only when no Finnhub key is set.
    UPSTOX_ACCESS_TOKEN: optional(z.string()),
    UPSTOX_API_URL: unsetIfEmpty(z.url().default('https://api.upstox.com/v3')),
    // A live price older than this is rejected (stale or market closed).
    MARKET_DATA_MAX_AGE_SECONDS: unsetIfEmpty(z.coerce.number().int().positive().default(120)),
    // Daily FX reference rates (Frankfurter). Slack covers weekends and holidays.
    FX_API_URL: unsetIfEmpty(z.url().default('https://api.frankfurter.dev')),
    FX_RATE_MAX_AGE_DAYS: unsetIfEmpty(z.coerce.number().int().positive().default(4)),
    // Daily closes for the Mode A fan chart. Off by default: Yahoo Finance is free and keyless
    // but unofficial (no SLA; its terms apply).
    MARKET_HISTORY_PROVIDER: unsetIfEmpty(z.enum(['none', 'yahoo']).default('none')),
    MARKET_HISTORY_API_URL: unsetIfEmpty(z.url().default('https://query1.finance.yahoo.com')),
  })
  .superRefine((env, ctx) => {
    if (!env.FIREBASE_CLIENT_EMAIL !== !env.FIREBASE_PRIVATE_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['FIREBASE_CLIENT_EMAIL'],
        message:
          'FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set together (or both left empty)',
      });
    }
    if (env.NODE_ENV === 'production') {
      for (const name of FIREBASE_REQUIRED) {
        if (!env[name]) {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: `${name} is required in production`,
          });
        }
      }
    }
  });

export type Env = z.output<typeof envSchema>;

/** Validate an env source. Error messages name variables only, never their values. */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`),
    );
  }
  return result.data;
}

/** Load a dotenv file into process.env if it exists. Variables already set are never overridden. */
export function loadDotenv(
  path: string = resolve(import.meta.dirname, '../../../../.env'),
): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}
