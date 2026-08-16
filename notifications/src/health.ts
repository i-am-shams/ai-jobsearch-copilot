import { createServer } from 'node:http';
import { config } from './config.js';
import { isRabbitConnected } from './rabbitmq.js';
import { getDb, isMongoConnected } from './mongo.js';

/**
 * Same liveness/readiness split as the API (Program.cs) and the worker's
 * heartbeat file: liveness never checks dependencies, because Docker
 * restarts a container that fails it, and a brief Mongo/RabbitMQ blip
 * shouldn't be treated as "this process is broken" - only readiness reports
 * that, and nothing here restarts on a failed readiness check.
 */
export function startHealthServer(): void {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Healthy');
      return;
    }

    if (req.url === '/health/ready') {
      void checkReady().then((ready) => {
        res.writeHead(ready ? 200 : 503, { 'Content-Type': 'text/plain' });
        res.end(ready ? 'Ready' : 'Not ready');
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(config.port, () => {
    console.log(`[health] listening on :${config.port}`);
  });
}

async function checkReady(): Promise<boolean> {
  if (!isRabbitConnected() || !isMongoConnected()) return false;
  try {
    await getDb().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
