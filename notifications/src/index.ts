import 'dotenv/config';
import { connectMongoWithRetry, closeMongo } from './mongo.js';
import { startConsuming, closeRabbit } from './rabbitmq.js';
import { handleMatchCompleted } from './handler.js';
import { startHealthServer } from './health.js';

async function main() {
  await connectMongoWithRetry();
  console.log('[mongo] connected');

  startHealthServer();
  await startConsuming(handleMatchCompleted);
}

async function shutdown(signal: string) {
  console.log(`[shutdown] received ${signal}, closing connections...`);
  await Promise.allSettled([closeRabbit(), closeMongo()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((err) => {
  console.error('[fatal] failed to start notifications service:', err);
  process.exit(1);
});
