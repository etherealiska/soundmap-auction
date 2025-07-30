import Fastify from 'fastify';
import { postConnectHandler } from './routes/connect';
import { postBidHandler } from './routes/bid';
import { getEventsHandler } from './routes/event';
import * as schema from './db/schema';
import { Kafka } from 'kafkajs';
import { drizzle } from "drizzle-orm/postgres-js";
import { postSessionHandler } from './routes/session';

async function start() {
  const fastify = Fastify({ logger: true });

  // In-memory map of SSE clients: playerId -> reply.raw
  const sseClients = new Map<string, any>();

  // 1. Setup Drizzle
  const connectionString = process.env.PG_CONNECTION_STRING || "postgres://myuser:mypass@localhost:5432/mydb";
  const db = drizzle(connectionString, { schema });

  // 2. Setup Kafka
  const kafka = new Kafka({
    clientId: 'auction-api',
    brokers: [process.env.KAFKA_BROKER || '0.0.0.0:9092'],
  });

  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: 'sse-listeners' });

  await producer.connect();
  await consumer.connect();

  // 3. Subscribe to round.results topic in order to push data to contestants
  await consumer.subscribe({ topic: 'round.results', fromBeginning: false });

  consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (topic === 'round.results' && message.value) {
        const result = JSON.parse(message.value.toString());

        // Broadcast to local SSE clients
        result.bids.forEach((bid: { playerId: string }) => {
          const sse = sseClients.get(bid.playerId);
          if (sse) {
            sse.write(`data: ${JSON.stringify(result)}\n\n`);
          }
        });
      }
    },
  });

  // 4. Routes
  fastify.post('/session', postSessionHandler(db));
  fastify.post('/connect', postConnectHandler(db));
  fastify.post('/bid', postBidHandler(db, producer)); // producer passed for emitting results
  fastify.get('/events', getEventsHandler(db, sseClients));

  // 5. Start server
  await fastify.listen({ port: 3000, host: '0.0.0.0' });
  console.log('Server listening on http://localhost:3000');
}

start().catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});

