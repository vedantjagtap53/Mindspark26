import { ConfigError, loadConfig, loadDotenv, type AppConfig } from './config/index.js';
import { createApp } from './app.js';
import { attachLiveSocket } from './routes/liveSocket.js';
import { createMarketData } from './services/market-data/createMarketData.js';
import { consoleLogger } from './utils/logger.js';

function readConfig(): AppConfig {
  loadDotenv();
  try {
    return loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

function main(): void {
  const config = readConfig();
  const marketData = createMarketData(config, consoleLogger);
  const app = createApp(config, consoleLogger, { marketData: marketData.service });
  const server = app.listen(config.port, () => {
    consoleLogger.info(`API listening on port ${config.port} (${config.env})`);
  });
  const live = attachLiveSocket(server, marketData.stream, consoleLogger);

  const shutdown = (signal: string) => {
    consoleLogger.info(`${signal} received, shutting down`);
    live.close();
    marketData.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
