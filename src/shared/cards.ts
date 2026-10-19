// Card model. A card id is rank + suit + deck index, e.g. "10H2" or "AS0".
// Three decks are used, so the same rank/suit appears up to three times.

export type Suit = "S" | "H" | "C" | "D";
export type CardId = string;

export const SUITS: Suit[] = ["S", "H", "C", "D"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", C: "♣", D: "♦" };
export const SUIT_NAME: Record<Suit, string> = { S: "spades", H: "hearts", C: "clubs", D: "diamonds" };
export const DECKS = 3;
export const HAND_SIZE = 21;

export interface Card {
  id: CardId;
  rank: number; // 1 (A) .. 13 (K)
  suit: Suit;
  deck: number;
}

const cache = new Map<CardId, Card>();

export function card(id: CardId): Card {
  let c = cache.get(id);
  if (!c) {
    const deck = Number(id.slice(-1));
    const suit = id.slice(-2, -1) as Suit;
    const rank = RANKS.indexOf(id.slice(0, -2)) + 1;
    if (rank < 1 || !SUITS.includes(suit) || !(deck >= 0 && deck < DECKS)) throw new Error("Bad card id " + id);
    c = { id, rank, suit, deck };
    cache.set(id, c);
  }
  return c;
}

export function isCardId(id: unknown): id is CardId {
  if (typeof id !== "string") return false;
  try {
    card(id);
    return true;
  } catch {
    return false;
  }
}

/** Identity ignoring which deck the card came from ("7H"). */
export const faceKey = (id: CardId) => id.slice(0, -1);
export const isRed = (s: Suit) => s === "H" || s === "D";
export const rankLabel = (r: number) => RANKS[r - 1];
export const cardLabel = (id: CardId) => {
  const c = card(id);
  return rankLabel(c.rank) + SUIT_SYMBOL[c.suit];
};

export function fullDeck(): CardId[] {
  const out: CardId[] = [];
  for (let d = 0; d < DECKS; d++) for (const s of SUITS) for (const r of RANKS) out.push(r + s + d);
  return out;
}

export function shuffle<T>(arr: T[], rand: (n: number) => number = cryptoInt): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function cryptoInt(n: number): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] % n;
}

const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };

export function sortBySuit(ids: CardId[]): CardId[] {
  return [...ids].sort((a, b) => {
    const x = card(a), y = card(b);
    return SUIT_ORDER[x.suit] - SUIT_ORDER[y.suit] || x.rank - y.rank || x.deck - y.deck;
  });
}

export function sortByRank(ids: CardId[]): CardId[] {
  return [...ids].sort((a, b) => {
    const x = card(a), y = card(b);
    return x.rank - y.rank || SUIT_ORDER[x.suit] - SUIT_ORDER[y.suit] || x.deck - y.deck;
  });
}

// ---------- Maal (wild cards) ----------

export type MaalKind = "tiplu" | "poplu" | "jhiplu" | "alter" | "joker";

const nextRank = (r: number) => (r === 13 ? 1 : r + 1);
const prevRank = (r: number) => (r === 1 ? 13 : r - 1);

/**
 * What a card is relative to the maal (tiplu) card.
 * - tiplu: same rank and suit as the maal card
 * - poplu / jhiplu: same suit, one rank above / below
 * - alter: same rank, the other suit of the same colour
 * - joker: same rank, opposite colour (wild, but scores no points)
 */
export function maalKind(id: CardId, maal: CardId | null | undefined): MaalKind | null {
  if (!maal) return null;
  const c = card(id), m = card(maal);
  if (c.rank === m.rank) {
    if (c.suit === m.suit) return "tiplu";
    return isRed(c.suit) === isRed(m.suit) ? "alter" : "joker";
  }
  if (c.suit === m.suit) {
    if (c.rank === nextRank(m.rank)) return "poplu";
    if (c.rank === prevRank(m.rank)) return "jhiplu";
  }
  return null;
}

export const isWild = (id: CardId, maal: CardId | null | undefined) => maalKind(id, maal) !== null;
