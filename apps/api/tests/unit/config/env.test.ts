import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, loadDotenv } from '../../../src/config/index.js';
import { parseEnv } from '../../../src/config/env.js';

describe('parseEnv', () => {
  it('applies defaults for an empty environment', () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(4000);
    expect(env.AI_FORECAST_TIMEOUT_MS).toBe(15_000);
  });

  it('treats empty strings (as shipped in .env.example) as unset', () => {
    const env = parseEnv({ API_PORT: '', SUPABASE_URL: '', AI_API_URL: '', NODE_ENV: '' });
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.SUPABASE_URL).toBeUndefined();
    expect(env.AI_API_URL).toBeUndefined();
  });

  it('coerces the port from a string', () => {
    expect(parseEnv({ API_PORT: '8080' }).API_PORT).toBe(8080);
  });

  it.each([
    [{ API_PORT: 'abc' }, 'API_PORT'],
    [{ API_PORT: '70000' }, 'API_PORT'],
    [{ NODE_ENV: 'staging' }, 'NODE_ENV'],
    [{ AI_API_URL: 'not a url' }, 'AI_API_URL'],
    [{ AI_FORECAST_TIMEOUT_MS: '-5' }, 'AI_FORECAST_TIMEOUT_MS'],
  ])('rejects invalid values %j', (source, variable) => {
    expect(() => parseEnv(source)).toThrow(ConfigError);
    expect(() => parseEnv(source)).toThrow(variable);
  });

  it('requires the Supabase URL and service-role key as a pair', () => {
    expect(() => parseEnv({ SUPABASE_URL: 'https://x.supabase.co' })).toThrow(/set together/);
    expect(() => parseEnv({ SUPABASE_SERVICE_ROLE_KEY: 'k' })).toThrow(/set together/);
  });

  it('rejects a Supabase URL that is not a URL', () => {
    expect(() => parseEnv({ SUPABASE_URL: 'nope', SUPABASE_SERVICE_ROLE_KEY: 'k' })).toThrow(
      'SUPABASE_URL',
    );
  });

  it('rejects a Supabase URL with a path such as /rest/v1', () => {
    const key = { SUPABASE_SERVICE_ROLE_KEY: 'k' };
    expect(() => parseEnv({ ...key, SUPABASE_URL: 'https://x.supabase.co/rest/v1/' })).toThrow(
      /SUPABASE_URL: must be the project URL without a path/,
    );
    expect(parseEnv({ ...key, SUPABASE_URL: 'https://x.supabase.co/' }).SUPABASE_URL).toBe(
      'https://x.supabase.co/',
    );
  });

  it('requires the Supabase URL and service-role key in production', () => {
    for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
      expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(
        `${name} is required in production`,
      );
    }
    expect(
      parseEnv({
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
        AUTH_JWT_SECRET: 's'.repeat(32),
      }).NODE_ENV,
    ).toBe('production');
  });

  it('requires AUTH_JWT_SECRET in production, at least 32 characters', () => {
    const base = {
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
    };
    expect(() => parseEnv(base)).toThrow('AUTH_JWT_SECRET is required in production');
    expect(() => parseEnv({ ...base, AUTH_JWT_SECRET: 'short' })).toThrow('AUTH_JWT_SECRET');
  });

  it('does not require database configuration outside production', () => {
    expect(() => parseEnv({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => parseEnv({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('never echoes secret values in error messages', () => {
    const secret = 'super-secret-private-key';
    try {
      parseEnv({ SUPABASE_SERVICE_ROLE_KEY: secret, API_PORT: 'nope' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).message).not.toContain(secret);
    }
  });

  it('reports every problem at once', () => {
    try {
      parseEnv({ API_PORT: 'x', NODE_ENV: 'staging' });
      expect.unreachable();
    } catch (err) {
      expect((err as ConfigError).issues).toHaveLength(2);
    }
  });
});

describe('loadConfig', () => {
  it('maps env to a typed config with database status flags', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      API_PORT: '5000',
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      AUTH_JWT_SECRET: 's'.repeat(32),
      AI_API_URL: 'https://ai.example',
    });
    expect(config.env).toBe('production');
    expect(config.port).toBe(5000);
    expect(config.database).toEqual({
      configured: true,
      url: 'https://x.supabase.co',
      serviceRoleKey: 'k',
    });
    expect(config.ai.baseUrl).toBe('https://ai.example');
  });
});

describe('loadDotenv', () => {
  const dirs: string[] = [];
  const keys = ['MINDSPARK_TEST_NEW', 'MINDSPARK_TEST_EXISTING'];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    for (const k of keys) delete process.env[k];
  });

  function envFile(content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'mindspark-env-'));
    dirs.push(dir);
    const path = join(dir, '.env');
    writeFileSync(path, content);
    return path;
  }

  it('returns false and changes nothing when the file is missing', () => {
    expect(loadDotenv(join(tmpdir(), 'mindspark-does-not-exist', '.env'))).toBe(false);
  });

  it('loads variables but never overrides ones already set', () => {
    process.env.MINDSPARK_TEST_EXISTING = 'from-shell';
    const path = envFile('MINDSPARK_TEST_NEW=from-file\nMINDSPARK_TEST_EXISTING=from-file\n');
    expect(loadDotenv(path)).toBe(true);
    expect(process.env.MINDSPARK_TEST_NEW).toBe('from-file');
    expect(process.env.MINDSPARK_TEST_EXISTING).toBe('from-shell');
  });
});

describe('auth config', () => {
  it('is relaxed outside production with a random per-process secret', () => {
    const a = loadConfig({}).auth;
    expect(a).toMatchObject({
      enforced: false,
      payloadHashRequired: false,
      cookieSecure: false,
      jwtSecretEphemeral: true,
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604_800,
    });
    expect(a.jwtSecret).toHaveLength(64);
    expect(loadConfig({}).auth.jwtSecret).not.toBe(a.jwtSecret);
  });

  it('is strict in production unless overridden', () => {
    const prod = {
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      AUTH_JWT_SECRET: 'x'.repeat(40),
    };
    expect(loadConfig(prod).auth).toMatchObject({
      enforced: true,
      payloadHashRequired: true,
      cookieSecure: true,
      jwtSecretEphemeral: false,
      jwtSecret: 'x'.repeat(40),
    });
    expect(loadConfig({ ...prod, AUTH_COOKIE_SECURE: 'false' }).auth.cookieSecure).toBe(false);
  });

  it('parses explicit flags and rejects other values', () => {
    expect(loadConfig({ AUTH_ENFORCED: 'true' }).auth.enforced).toBe(true);
    expect(() => parseEnv({ AUTH_ENFORCED: 'yes' })).toThrow('AUTH_ENFORCED');
    expect(() => parseEnv({ AUTH_ACCESS_TTL_SECONDS: '5' })).toThrow('AUTH_ACCESS_TTL_SECONDS');
  });
});
