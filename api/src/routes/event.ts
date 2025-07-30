import { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { sessionPlayers } from '../db/schema';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { z } from "zod";

const streamQuerySchema = z.object({
  playerId: z.string().uuid(),
});

export function getEventsHandler(
  db: PostgresJsDatabase<typeof import('../db/schema')>,
  sseClients: Map<string, any>
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {

    const parseResult = streamQuerySchema.safeParse(request.query);

    if (!parseResult.success) {
      reply.status(400).send({ error: 'Invalid playerId' });
      return;
    }

    const { playerId } = parseResult.data;

    // Verify player exists in session_players
    const playerList = await db.select().from(sessionPlayers).where(eq(sessionPlayers.playerId, playerId));


    if (playerList.length === 0) {
      reply.status(400).send('Invalid player-id');
      return;
    }

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    sseClients.set(playerId, reply.raw);

    const keepAliveInterval = setInterval(() => {
      reply.raw.write(': keep-alive\n\n'); // SSE comment keeps connection alive
    }, 15000);

    request.raw.on('close', () => {
      sseClients.delete(playerId);
      clearInterval(keepAliveInterval);
      reply.raw.end();
    });
  };
}