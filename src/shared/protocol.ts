import { CardId } from "./cards";
import { MaalBreakdown } from "./scoring";
import { Settings } from "./settings";

export type TableStatus = "lobby" | "playing" | "roundEnd" | "matchEnd";
export type Route = "pure" | "dublee";

export interface SeatView {
  id: string;
  name: string;
  avatar: number;
  isBot: boolean;
  connected: boolean;
  autoplay: boolean; // a bot is playing for this person
  cardCount: number;
  seen: Route | null;
  shown: CardId[][];
  /** The first `tunnels` sets in `shown` are tunnela shown before the first draw. */
  tunnels?: number;
  /** Cards this player has thrown this round, oldest first. Public, like a real discard pile. */
  thrown: ThrownCard[];
}

export interface ThrownCard {
  card: CardId;
  /** Someone picked it up from the discard pile. */
  taken?: boolean;
}

export interface RoundRow {
  round: number;
  dealerId: string;
  winnerId: string; // "" when the round was called off
  route: Route;
  points: Record<string, number>;
  seen: Record<string, boolean>;
  maal: CardId;
}

export interface RoundReveal {
  winnerId: string;
  route: Route;
  maal: CardId;
  discard: CardId;
  players: {
    id: string;
    seen: boolean;
    shown: CardId[][];
    /** The first `tunnels` sets in `shown` are tunnela shown before the first draw. */
    tunnels?: number;
    groups: CardId[][]; // winner's final sets
    hand: CardId[];
    maal: number;
    rawMaal: number;
    breakdown: MaalBreakdown;
    points: number;
  }[];
}

export interface LogEntry {
  t: number;
  text: string;
}

export interface TableView {
  code: string;
  you: string;
  hostId: string;
  practice: boolean;
  settings: Settings;
  status: TableStatus;
  round: number;
  seats: SeatView[];
  dealer: number;
  turn: number;
  phase: "draw" | "discard";
  stockCount: number;
  discardTop: CardId | null;
  discardBy: string | null; // player id
  discardRecent: CardId[];
  maal: CardId | null; // visible only once you've seen
  maalHidden: boolean;
  hand: CardId[];
  drawn: CardId | null;
  picked: CardId | null; // taken from the discard pile this turn (can't be thrown back)
  deadline: number | null;
  /** When the current turn began (server clock); null between rounds. */
  turnStartedAt: number | null;
  rounds: RoundRow[];
  reveal: RoundReveal | null;
  log: LogEntry[];
  spectators: { id: string; name: string }[];
  /** Everyone who has sat at this table this match, including people who left. */
  names: Record<string, string>;
  /** When this match started; with the code it identifies the match in history. */
  matchStartedAt: number;
  /** Server clock when this view was made, so timers don't depend on the phone's clock. */
  serverNow: number;
  /** Your turn, after drawing: can you finish now, and with which throw? (server-computed) */
  canDeclare: boolean;
  finishDiscard: CardId | null;
  /** Your first turn, before drawing, holding tunnels: you may show them now. */
  canOpenTunnels: boolean;
  /** Pure sets you still need to see the maal (fewer after showing tunnels). */
  setsNeeded: number;
}

export interface Ack<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

/** Public status of a table, for "Your tables" on the home screen. */
export interface TableStatusInfo {
  exists: boolean;
  status?: TableStatus;
  round?: number;
  rounds?: number;
  players?: string[];
}

export interface Session {
  code: string;
  playerId: string;
  token: string;
}
