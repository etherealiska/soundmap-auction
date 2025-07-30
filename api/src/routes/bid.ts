import { FastifyReply, FastifyRequest } from "fastify";
import { TOTAL_ROUNDS } from "../constants";
import { z } from 'zod';
import { bids, sessionPlayers, sessions } from '../db/schema';
import { and, eq } from "drizzle-orm";
import { Producer } from 'kafkajs';
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";

const bidSchema = z.object({
  playerId: z.string().uuid(),
  bid: z.number().nonnegative(),
});

export function postBidHandler(
  db: PostgresJsDatabase<typeof import('../db/schema')>,
  producer: Producer
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = bidSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: "Invalid input" });
    }

    const { playerId, bid } = parseResult.data;

    try {
      // Validate player exists in session_players and get sessionId and money
      const sessionPlayer = (await db
        .select()
        .from(sessionPlayers)
        .where(eq(sessionPlayers.playerId, playerId))
      )[0];

      if (!sessionPlayer) throw new Error("Invalid playerId");

      const sessionId = sessionPlayer.sessionId;

      // Get session info
      const session = (await db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];
      if (!session) throw new Error("Player session not found");
      if (session.currentRound > TOTAL_ROUNDS) throw new Error("Auction finished");

      if (bid > sessionPlayer.money) throw new Error("Bid exceeds available money");

      // Check if player already bid this round
      const existingBid = await db
        .select()
        .from(bids)
        .where(
          and(
            eq(bids.sessionId, sessionId),
            eq(bids.round, session.currentRound),
            eq(bids.playerId, playerId)
          )
        );

      if (existingBid.length > 0) throw new Error("Player already bid this round");

      // Insert bid (no transaction needed here)
      const newBidId = crypto.randomUUID();
      await db.insert(bids).values({
        id: newBidId,
        playerId,
        sessionId,
        round: session.currentRound,
        amount: bid,
      });

      // Produce "bid.received" event to Kafka
      await producer.send({
        topic: "bid.received",
        messages: [
          {
            value: JSON.stringify({
              bidId: newBidId,
              playerId,
              sessionId,
              round: session.currentRound,
              amount: bid,
            }),
          },
        ],
      });

      reply.send({ message: "Bid received", currentRound: session.currentRound });
    } catch (error: any) {
      reply.status(400).send({ error: error.message || "Invalid bid" });
    }
  };
}
