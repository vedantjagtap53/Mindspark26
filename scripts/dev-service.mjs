// Starts a Python service from its .venv (created by `npm run setup`).
//   npm run dev:forecast → services/forecast on :8000, FORECAST_API_KEY = AI_API_KEY from .env
//   npm run dev:rag      → services/rag on :8001, SERVICE_API_KEY = RAG_API_KEY from .env
//                          (GOOGLE_API_KEY and model settings come from services/rag/.env)
//   npm run rag:index    → builds the RAG knowledge-base index (needs GOOGLE_API_KEY)
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { venvPython } from './venv.mjs';

const root = resolve(import.meta.dirname, '..');
const uvicorn = (app, port) => ['-m', 'uvicorn', app, '--host', '127.0.0.1', '--port', port];
// key: the root .env variable passed to the service as `as`.
const SERVICES = {
  forecast: {
    dir: 'forecast',
    args: uvicorn('forecast_service.api:app', '8000'),
    key: { from: 'AI_API_KEY', as: 'FORECAST_API_KEY' },
  },
  rag: {
    dir: 'rag',
    args: uvicorn('rag.api.app:app', '8001'),
    key: { from: 'RAG_API_KEY', as: 'SERVICE_API_KEY' },
  },
  'rag-index': { dir: 'rag', args: ['-m', 'rag.kb.build', '--rebuild'] },
};

const name = process.argv[2];
const service = SERVICES[name];
if (!service) {
  console.error(`Usage: node scripts/dev-service.mjs <${Object.keys(SERVICES).join('|')}>`);
  process.exit(1);
}

const dir = join(root, 'services', service.dir);
const python = venvPython(dir);
if (!existsSync(python)) {
  console.error(`No virtual environment in services/${service.dir}. Run: npm run setup`);
  process.exit(1);
}

const env = { ...process.env };
if (service.key) {
  // The backend sends this key; the service checks it under its own variable name.
  const dotenv = join(root, '.env');
  const key =
    process.env[service.key.from] ||
    (existsSync(dotenv) ? parseEnv(readFileSync(dotenv, 'utf8'))[service.key.from] : undefined);
  if (!key) {
    console.error(`${service.key.from} is not set in .env. Run: npm run setup`);
    process.exit(1);
  }
  env[service.key.as] = key;
}

const child = spawn(python, service.args, { cwd: dir, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
