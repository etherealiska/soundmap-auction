import { Player } from "../types";

export class Bot implements Player {
  id: string;
  sessionId: string;
  name: string;
  remainingMoney: number = 1000;

  history: number[] = [];

  constructor(player: Player) {
    this.id = player.id;
    this.sessionId = player.sessionId;
    this.name = player.name;
  }

  nextBid(): number {
    return 0;
  }

  // Add history entry after a bid attempt
  addHistory(amount: number) {
    this.history.push(amount);
  }

  updateMoney(amount: number) {
    this.remainingMoney -= amount;
    if (this.remainingMoney < 0) {
      throw new Error(`Bot ${this.name} has negative money: ${this.remainingMoney}`);
    }
  }
}

export class CopyCatBot extends Bot {
  nextBid(): number {
    const lastBid = this.history[this.history.length - 1] || 10;
    return Math.min(lastBid, this.remainingMoney); // ensure we don't bid more than we have
  }
}

export class SporadicBot extends Bot {
  nextBid(): number {
    // Randomly bid between 10 and 100, but not more than remaining money
    const bid = Math.floor(Math.random() * 90 + 10);
    return Math.min(bid, this.remainingMoney);
  }
}

export class AggressiveBot extends Bot {
  percentageIncrease: number = 10;

  nextBid(): number {
    const lastWinningBid = this.history[this.history.length - 1];

    // If no history, start with a default bid
    if (lastWinningBid === undefined) {
      return Math.min(10, this.remainingMoney);
    }

    const increasedBid = Math.ceil(lastWinningBid * (1 + this.percentageIncrease / 100));
    return Math.min(increasedBid, this.remainingMoney);
  }
}

