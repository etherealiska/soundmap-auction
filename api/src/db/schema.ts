import { pgTable, text, integer, primaryKey, index, boolean, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Sessions table
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  currentRound: integer("current_round").notNull(),
  isOpen: boolean("is_open").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// Bids table
export const bids = pgTable("bids", {
  id: text("id").primaryKey(),
  playerId: text("player_id").notNull(),
  sessionId: text("session_id").notNull(),
  round: integer("round").notNull(),
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  sessionRoundIdx: index("idx_bids_session_round").on(table.sessionId, table.round),
}));

// Session Players table
export const sessionPlayers = pgTable("session_players", {
  playerId: text("player_id").notNull(),
  sessionId: text("session_id").notNull(),
  money: integer("money").notNull().default(1000),
  name: text("name").notNull(),
}, (t) => ({
  pk: primaryKey(t.playerId, t.sessionId),
}));

// Player Wins table
export const playerWins = pgTable("player_wins", {
  playerId: text("player_id").notNull(),
  sessionId: text("session_id").notNull(),
  round: integer("round").notNull(),
}, (table) => ({
  pk: primaryKey(table.sessionId, table.round), // One winner per round per session
}));
