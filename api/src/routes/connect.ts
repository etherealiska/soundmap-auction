import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { sessionPlayers } from "../db/schema";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { randomUUID } from "crypto";
import { MAX_PLAYERS_PER_SESSION, STARTING_MONEY } from "../constants";

const schema = z.object({
  name: z.string().min(1),
  sessionId: z.string().uuid(),
});

export function postConnectHandler(db: PostgresJsDatabase<typeof import("../db/schema")>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const parse = schema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid name or sessionId" });
    }

    const { name, sessionId } = parse.data;
    const trimmedName = name.trim();

    try {
      const result = await db.transaction(async (tx) => {
        // Check session exists and is open
        const session = await tx.query.sessions.findFirst({
          where: (s) => eq(s.id, sessionId),
        });

        if (!session || !session.isOpen) {
          return reply.status(400).send({ error: "Session does not exist or is closed" });
        }

        // Fetch current players
        const currentPlayers = await tx
          .select()
          .from(sessionPlayers)
          .where(eq(sessionPlayers.sessionId, sessionId));

        if (currentPlayers.length >= MAX_PLAYERS_PER_SESSION) {
          return reply.status(400).send({ error: "Session already has 4 players" });
        }

        // Check for existing player with same name
        const existing = currentPlayers.find((p) => p.name === trimmedName);
        if (existing) {
          return { playerId: existing.playerId, sessionId };
        }

        // Create player
        const playerId = randomUUID();
        await tx.insert(sessionPlayers).values({
          playerId,
          sessionId,
          name: trimmedName,
          money: STARTING_MONEY,
        });

        return { playerId, sessionId };
      });

      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  };
}
