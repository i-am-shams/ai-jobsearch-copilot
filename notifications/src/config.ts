// Same convention as Worker.cs/MatchCompletedConsumer.cs: env vars with
// localhost/devpassword defaults, so this runs against the local dev stack
// with zero configuration and only needs real values in Docker Compose/prod.
export const config = {
  rabbitmq: {
    host: process.env.RABBITMQ_HOST ?? 'localhost',
    port: Number(process.env.RABBITMQ_PORT ?? 5672),
    username: process.env.RABBITMQ_USERNAME ?? 'jobcopilot',
    password: process.env.RABBITMQ_PASSWORD ?? 'devpassword',
  },
  mongo: {
    uri: process.env.MONGO_URI ?? 'mongodb://localhost:27017',
    dbName: process.env.MONGO_DB_NAME ?? 'jobcopilot_notifications',
  },
  port: Number(process.env.PORT ?? 8081),
};
