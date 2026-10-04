export interface Logger {
  error(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
}

export const consoleLogger: Logger = {
  error: (message, meta) => console.error(message, meta ?? ''),
  info: (message, meta) => console.info(message, meta ?? ''),
};

export const silentLogger: Logger = { error: () => undefined, info: () => undefined };
