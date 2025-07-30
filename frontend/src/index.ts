import * as readline from "readline";
import { EventSource } from "eventsource";
import { Player } from "./types";
import { AggressiveBot, Bot, CopyCatBot, SporadicBot } from "./bots";

const API_URL = "http://localhost:3000";

async function connectPlayer(name: string, sessionId: string): Promise<Player> {
  const res = await fetch(`${API_URL}/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, sessionId }),
  });

  if (!res.ok) {
    throw new Error(`Failed to connect player "${name}": ${await res.text()}`);
  }

  const data = (await res.json()) as { playerId: string; sessionId: string };
  return { id: data.playerId, sessionId: data.sessionId, name };
}

async function setup(): Promise<Player[]> {
  // Get a new sessionId from the backend
  const sessionRes = await fetch(`${API_URL}/session`, { method: "POST" });
  if (!sessionRes.ok) {
    throw new Error(`Failed to create session: ${await sessionRes.text()}`);
  }
  const { sessionId } = await sessionRes.json();

  const names = ["BotAlpha", "BotBeta", "BotGamma", "You"];
  const players = await Promise.all(names.map((name) => connectPlayer(name, sessionId)));
  console.log("Connected players:");

  players.forEach((p) => console.log(`- ${p.name}: ${p.id} (session: ${p.sessionId})`));

  return players;
}

function listenToEvents(player: Bot) {
  const url = `${API_URL}/events`;
  const eventSource = new EventSource(`${url}?playerId=${player.id}`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log(`[EVENT][${player.name}]`, data);

      // Update bots internals
      const winningAmount = data.bids.find((b: {playerId: string, amount: number }) => b.playerId === data.winnerId)?.amount || 0
      player.addHistory(winningAmount);

      if (data.winnerId === player.id) {
        console.log(`[EVENT][${player.name}] You won this round with amount: ${winningAmount}`);
        player.updateMoney(winningAmount);
      }

      // place another bid
      const nextBid = player.nextBid();
      postBid(player, nextBid)

    } catch (err) {
      console.error(`[EVENT][${player.name}] Failed to parse event data`, err);
    }
  };

  eventSource.onerror = (err) => {
    console.error(`[EVENT][${player.name}] EventSource error:`, err);
    eventSource.close();
  };
}

async function postBid(player: Player, bidAmount: number) {
  const res = await fetch(`${API_URL}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerId: player.id,
      bid: bidAmount,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[BID][${player.name}] Failed to submit bid:`, errText);
  } else {
    const data = (await res.json()) as { message: string };
    console.log(`[BID][${player.name}] Bid accepted for amount: ${bidAmount}. Server message:`, data.message);
  }
}

async function main() {
  const players = await setup();
  const user = players.find((p) => p.name === "You");
  if (!user) throw new Error("User player not found");

  // Start listening to SSE events for all bots
  const bots = players
    .filter(p => p.name !== "You")
    .map((p, i) => {
      switch (i) {
        case 0:
          return new SporadicBot(p);
        case 1:
          return new CopyCatBot(p);
        case 2:
          return new AggressiveBot(p);
        default:
          return new Bot(p);
      }
  });

  bots.forEach(listenToEvents);

  // place initial bids for all bots
  await Promise.all(bots.map((b) => {
    return postBid(b, b.nextBid());
  }))

  // Setup readline interface for user input (bids)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('Enter your bid amount as a number and press Enter:');

  rl.on("line", async (input) => {
    const bid = parseInt(input.trim(), 10);
    if (isNaN(bid)) {
      console.log("Please enter a valid number for your bid.");
      return;
    }
    await postBid(user, bid);
  });
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
