export const TOTAL_ROUNDS = 10;
export const STARTING_MONEY = 1000;
export const PROPERTIES = Array.from({ length: TOTAL_ROUNDS }, (_, i) => `Property ${i + 1}`);
export const MAX_PLAYERS_PER_SESSION = 4;
export const OPEN_SESSION_KEY = 'current_open_session';