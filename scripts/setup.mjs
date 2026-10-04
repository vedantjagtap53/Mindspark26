// One-time local setup, safe to re-run: .env files, Node dependencies, and a Python virtual
// environment per service. Existing .env files and venvs are never overwritten.
//   npm run setup
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { venvPython } from './venv.mjs';

const root = resolve(import.meta.dirname, '..');
const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
const step = (msg) => console.log(`\n== ${msg}`);

function createEnv(target, example, edit) {
  if (existsSync(target)) {
    console.log(`${target} exists, left as is`);
    return;
  }
  writeFileSync(target, edit(readFileSync(example, 'utf8')));
  console.log(`created ${target}`);
}

step('.env files');
// The backend and the forecast service share AI_API_KEY (scripts/dev-service.mjs passes it on).
createEnv(join(root, '.env'), join(root, '.env.example'), (text) =>
  text
    .replace(/^AI_API_URL=$/m, 'AI_API_URL=http://127.0.0.1:8000/v1')
    .replace(/^AI_API_KEY=$/m, `AI_API_KEY=${randomBytes(32).toString('hex')}`)
    .replace(/^RAG_API_URL=$/m, 'RAG_API_URL=http://127.0.0.1:8001')
    .replace(/^RAG_API_KEY=$/m, `RAG_API_KEY=${randomBytes(32).toString('hex')}`),
);
const rag = join(root, 'services', 'rag');
createEnv(join(rag, '.env'), join(rag, '.env.example'), (text) =>
  text.replace(/^GOOGLE_API_KEY=.*$/m, 'GOOGLE_API_KEY='),
);

step('Node dependencies');
run('npm', ['install']);

const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
for (const [name, requirements] of [
  ['forecast', 'requirements-dev.txt'],
  ['rag', 'requirements.txt'],
]) {
  const dir = join(root, 'services', name);
  step(`Python venv: services/${name}`);
  if (!existsSync(venvPython(dir))) run(python, ['-m', 'venv', '.venv'], dir);
  run(venvPython(dir), ['-m', 'pip', 'install', '-q', '--upgrade', 'pip'], dir);
  run(venvPython(dir), ['-m', 'pip', 'install', '-q', '-r', requirements], dir);
}

console.log(`
Setup done. Still needed by hand:
  - services/rag/.env: GOOGLE_API_KEY (explain/chat)
  - .env: UPSTOX_ACCESS_TOKEN for live Nifty 50 levels (optional; levels can be typed)
Start, one terminal each: npm run dev:forecast · npm run dev:api · npm run dev:web`);
