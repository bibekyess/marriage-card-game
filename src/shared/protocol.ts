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
  discardRecent: CardId[];
  maal: CardId | null; // visible only once you've seen
  maalHidden: boolean;
  hand: CardId[];
  drawn: CardId | null;
  picked: CardId | null; // taken from the discard pile this turn (can't be thrown back)
  deadline: number | null;
  rounds: RoundRow[];
  reveal: RoundReveal | null;
  log: LogEntry[];
  spectators: { id: string; name: string }[];
}

export interface Ack<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface Session {
  code: string;
  playerId: string;
  token: string;
}
