import { join } from 'node:path';

/** The Python interpreter inside a service's `.venv` (Scripts/ on Windows, bin/ elsewhere). */
export const venvPython = (serviceDir) =>
  process.platform === 'win32'
    ? join(serviceDir, '.venv', 'Scripts', 'python.exe')
    : join(serviceDir, '.venv', 'bin', 'python');
