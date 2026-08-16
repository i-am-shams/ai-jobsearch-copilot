import { MongoClient, type Db } from 'mongodb';
import { config } from './config.js';

let client: MongoClient | undefined;
let db: Db | undefined;

// Same retry-with-backoff shape as Worker.cs's ConnectWithRetryAsync - a cold
// docker compose start can bring this container up before Mongo is actually
// accepting connections, and failing on the first attempt would crash the
// whole service instead of just waiting.
export async function connectMongoWithRetry(maxAttempts = 10): Promise<Db> {
  let delayMs = 2000;
  for (let attempt = 1; ; attempt++) {
    try {
      client = new MongoClient(config.mongo.uri);
      await client.connect();
      db = client.db(config.mongo.dbName);
      await db.collection('notifications').createIndex({ applicationId: 1 });
      return db;
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      console.warn(
        `[mongo] connection attempt ${attempt}/${maxAttempts} failed: ${(err as Error).message}. Retrying in ${delayMs / 1000}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 2, 30_000);
    }
  }
}

export function getDb(): Db {
  if (!db) throw new Error('Mongo not connected yet');
  return db;
}

export function isMongoConnected(): boolean {
  // mongodb driver v6 doesn't expose a simple boolean here; a lightweight
  // ping is done separately in the readiness check instead of trusting a
  // cached flag, since the underlying socket can drop without an event we'd
  // reliably catch.
  return db !== undefined;
}

export async function closeMongo(): Promise<void> {
  await client?.close();
}
