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
    const env = parseEnv({ API_PORT: '', FIREBASE_PROJECT_ID: '', AI_API_URL: '', NODE_ENV: '' });
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.FIREBASE_PROJECT_ID).toBeUndefined();
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

  it('requires Firebase service-account credentials as a pair', () => {
    expect(() => parseEnv({ FIREBASE_CLIENT_EMAIL: 'a@b.c' })).toThrow(/set together/);
    expect(() => parseEnv({ FIREBASE_PRIVATE_KEY: 'k' })).toThrow(/set together/);
  });

  it('requires the Firebase SQL Connect project, service and location in production', () => {
    for (const name of [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_SQL_CONNECT_SERVICE_ID',
      'FIREBASE_SQL_CONNECT_LOCATION',
    ]) {
      expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(
        `${name} is required in production`,
      );
    }
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        FIREBASE_PROJECT_ID: 'p',
        FIREBASE_SQL_CONNECT_LOCATION: 'x',
      }),
    ).toThrow(/FIREBASE_SQL_CONNECT_SERVICE_ID/);
    expect(
      parseEnv({
        NODE_ENV: 'production',
        FIREBASE_PROJECT_ID: 'proj',
        FIREBASE_SQL_CONNECT_SERVICE_ID: 'svc',
        FIREBASE_SQL_CONNECT_LOCATION: 'asia-south1',
      }).NODE_ENV,
    ).toBe('production');
  });

  it('ignores Supabase variables left over from older .env files', () => {
    const env = parseEnv({ SUPABASE_URL: 'https://x.supabase.co', DATABASE_PRIMARY: 'supabase' });
    expect(env).not.toHaveProperty('SUPABASE_URL');
    expect(env).not.toHaveProperty('DATABASE_PRIMARY');
  });

  it('does not require database configuration outside production', () => {
    expect(() => parseEnv({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => parseEnv({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('never echoes secret values in error messages', () => {
    const secret = 'super-secret-private-key';
    try {
      parseEnv({ FIREBASE_PRIVATE_KEY: secret, API_PORT: 'nope' });
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
      FIREBASE_PROJECT_ID: 'proj',
      FIREBASE_SQL_CONNECT_SERVICE_ID: 'svc',
      FIREBASE_SQL_CONNECT_LOCATION: 'asia-south1',
      DATA_CONNECT_EMULATOR_HOST: '127.0.0.1:9399',
      AI_API_URL: 'https://ai.example',
    });
    expect(config.env).toBe('production');
    expect(config.port).toBe(5000);
    expect(config.database).toMatchObject({
      configured: true,
      projectId: 'proj',
      serviceId: 'svc',
      location: 'asia-south1',
      emulatorHost: '127.0.0.1:9399',
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
