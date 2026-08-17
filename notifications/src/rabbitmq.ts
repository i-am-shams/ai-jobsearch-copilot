import amqp, { type ChannelModel, type Channel } from 'amqplib';
import { config } from './config.js';

const EXCHANGE = 'match-completed-fanout';
const QUEUE = 'match-completed-notifications';
const DLX = 'match-completed-notifications.dlx';
const DLQ = 'match-completed-notifications.dlq';

let connection: ChannelModel | undefined;
let channel: Channel | undefined;

export function isRabbitConnected(): boolean {
  return connection !== undefined && channel !== undefined;
}

// Same retry-with-backoff shape as Worker.cs's ConnectWithRetryAsync - see
// that file for the full cold-start reasoning; the failure mode here is
// identical, just a different language.
async function connectWithRetry(maxAttempts = 10): Promise<ChannelModel> {
  const url = `amqp://${config.rabbitmq.username}:${config.rabbitmq.password}@${config.rabbitmq.host}:${config.rabbitmq.port}`;
  let delayMs = 2000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await amqp.connect(url);
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      console.warn(
        `[rabbitmq] connection attempt ${attempt}/${maxAttempts} failed: ${(err as Error).message}. Retrying in ${delayMs / 1000}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 2, 30_000);
    }
  }
}

export async function startConsuming(
  onMessage: (payload: unknown) => Promise<void>,
): Promise<void> {
  connection = await connectWithRetry();
  connection.on('close', () => {
    console.warn('[rabbitmq] connection closed');
    connection = undefined;
    channel = undefined;
  });

  channel = await connection.createChannel();

  // Independent subscriber on the same fanout exchange the API's
  // MatchCompletedConsumer binds to - see Worker.cs's PublishCompleted for
  // why this is a fanout and not a direct-to-queue publish. Declaring our
  // own durable queue here means we get every message regardless of what
  // the API is doing, and vice versa.
  await channel.assertExchange(EXCHANGE, 'fanout', { durable: true });

  // Dead-letter setup: a nacked (requeue=false) message routes here
  // automatically once the queue carries x-dead-letter-exchange - identical
  // pattern to Worker.cs's match-requests.dlx and
  // MatchCompletedConsumer.cs's match-completed-api.dlx.
  await channel.assertExchange(DLX, 'fanout', { durable: true });
  await channel.assertQueue(DLQ, { durable: true });
  await channel.bindQueue(DLQ, DLX, '');
  await channel.assertQueue(QUEUE, { durable: true, arguments: { 'x-dead-letter-exchange': DLX } });
  await channel.bindQueue(QUEUE, EXCHANGE, '');
  await channel.prefetch(1);

  await channel.consume(
    QUEUE,
    (msg) => {
      if (!msg) return;
      const activeChannel = channel;
      if (!activeChannel) return;

      const json = msg.content.toString('utf8');
      let payload: unknown;
      try {
        payload = JSON.parse(json);
      } catch (err) {
        console.error('[rabbitmq] malformed message body, dropping:', err);
        activeChannel.nack(msg, false, false);
        return;
      }

      onMessage(payload)
        .then(() => activeChannel.ack(msg))
        .catch((err) => {
          // Same reasoning as Worker.cs's consumer: nack with requeue=false.
          // A poison message that gets requeued goes straight back to the
          // only consumer and fails again in a tight loop; dead-lettered to
          // match-completed-notifications.dlq rather than lost.
          console.error('[rabbitmq] error handling message, dead-lettering it (not requeued):', err);
          activeChannel.nack(msg, false, false);
        });
    },
    { noAck: false },
  );

  console.log(`[rabbitmq] consuming ${QUEUE} (bound to ${EXCHANGE})`);
}

export async function closeRabbit(): Promise<void> {
  await channel?.close();
  await connection?.close();
}
