import { FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { z } from "zod";
import { sessions } from "../db/schema";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export function postSessionHandler(db: PostgresJsDatabase<typeof import('../db/schema')>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {

    const sessionId = randomUUID();
    const now = new Date();

    try {
      await db.insert(sessions).values({
        id: sessionId,
        currentRound: 1,
        isOpen: true,
        createdAt: now,
      });

      return reply.send({ sessionId });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: "Failed to create session" });
    }
  };
}