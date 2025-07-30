import { Kafka, Producer } from 'kafkajs';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import { bids, sessions, playerWins, sessionPlayers } from './db/schema';
import { PROPERTIES } from './constants'; // copy or define
import * as schema from './db/schema';
import { all } from 'axios';

const kafka = new Kafka({ 
  clientId: 'auction-worker',
  brokers: [process.env.KAFKA_BROKER || '0.0.0.0:9092'],
});

const consumer = kafka.consumer({ groupId: 'auction-worker' });
const producer = kafka.producer();

// Setup DB
const connectionString = process.env.PG_CONNECTION_STRING || "postgres://myuser:mypass@localhost:5432/mydb";
const db = drizzle(connectionString, { schema });

async function processRoundIfComplete(
  sessionId: string,
  currentRound: number,
  db: PostgresJsDatabase<typeof import('./db/schema')>,
  producer: Producer,
) {

  db.transaction(async (tx) => {
    // Get all bids for this round
    const roundBids = await tx
      .select()
      .from(bids)
      .where(
        and(
          eq(bids.sessionId, sessionId),
          eq(bids.round, currentRound)
        )
      );

    // Get all players in session from session_players
    const allPlayers = await tx
      .select()
      .from(sessionPlayers)
      .where(eq(sessionPlayers.sessionId, sessionId));

    if (roundBids.length !== allPlayers.length) {
      return; // Round not complete yet
    }

    // Determine winner (highest bid)
    const winner = roundBids.reduce((top, b) => (b.amount > top.amount ? b : top));
    
    // Find winning player in session_players
    const winningPlayer = allPlayers.find((p) => p.playerId === winner.playerId)!;

    if (!winningPlayer) {
      throw new Error('Winning player not found in session_players');
    }

    // Deduct money from winner in session_players
    await tx.update(sessionPlayers).set({
      money: winningPlayer.money - winner.amount,
    }).where(
      and(
        eq(sessionPlayers.sessionId, sessionId),
        eq(sessionPlayers.playerId, winner.playerId)
      )
    );

    // Insert player win record
    await tx.insert(playerWins).values({
      playerId: winner.playerId,
      sessionId,
      round: currentRound,
    });

    // Advance the session round
    await tx.update(sessions).set({
      currentRound: currentRound + 1,
    }).where(eq(sessions.id, sessionId));

    // Emit result to Kafka
    await producer.send({
      topic: 'round.results',
      messages: [
        {
          value: JSON.stringify({
            round: currentRound,
            bids: roundBids.map((b) => ({
              playerId: b.playerId,
              amount: b.amount,
            })),
            winnerId: winner.playerId,
            property: PROPERTIES[currentRound - 1],
          }),
        },
      ],
    });
  })
  
}

async function start() {
  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: 'bid.received', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const bidData = JSON.parse(message.value.toString()) as {
        playerId: string;
        bid: number;
        sessionId: string;
        round: number;
      };

      console.log(bidData);

      try {
        await processRoundIfComplete(bidData.sessionId, bidData.round, db, producer);
      } catch (e) {
        console.error('Error processing bid:', e);
      }
    },
  });

  console.log('Worker is running and listening to bid submissions...');
}

start().catch(console.error);
