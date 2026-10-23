import { CardId, maalKind, MaalKind } from "./cards";
import { isTunnel } from "./melds";
import { Scale, Settings } from "./settings";

export interface MaalBreakdown {
  tiplu: number;
  poplu: number;
  jhiplu: number;
  alter: number;
  /** Missing on rounds scored before the Bhoot existed. */
  bhoot?: number;
  /** Missing on rounds scored before Jokers scored. */
  joker?: number;
  marriages: number;
  /** Marriages shown as a pure set to see the maal. Missing on older rounds. */
  preMaal?: number;
  tunnels: number;
  points: number;
}

/** Points for `n` cards of one kind (capped at 3). */
const tier = (scale: Scale | undefined, n: number) => (n && scale ? scale[Math.min(n, 3) - 1] : 0);

/** True when `group` holds a natural tiplu, poplu and jhiplu (the Bhoot never makes a marriage). */
function isMarriage(group: CardId[], maal: CardId): boolean {
  const kinds = new Set(group.map((c) => maalKind(c, maal)));
  return kinds.has("tiplu") && kinds.has("poplu") && kinds.has("jhiplu");
}

/**
 * Maal points held by one player. Every tunnel in `groups` scores; `preMaal` are the pure sets
 * they showed to see the maal. A tunnela of alters, poplus/jhiplus or Jokers scores its own total
 * in place of its cards, and cards that make a marriage score on the marriage scale instead of their own.
 */
export function maalPoints(cards: CardId[], groups: CardId[][], maal: CardId, s: Settings, preMaal: CardId[][] = []): MaalBreakdown {
  const b = { tiplu: 0, poplu: 0, jhiplu: 0, alter: 0, bhoot: 0, joker: 0, marriages: 0, preMaal: 0, tunnels: 0, points: 0 };
  for (const c of cards) {
    const k = maalKind(c, maal);
    if (k && k !== "plain") b[k]++;
  }
  const tunnels = groups.filter(isTunnel);
  b.tunnels = tunnels.length;
  // Count each tunnela once: its cards leave the per-kind counts.
  const special: Partial<Record<MaalKind, number>> = { alter: s.alterTunnel, poplu: s.popluTunnel, jhiplu: s.popluTunnel, joker: s.jokerTunnel };
  let tunnelPts = 0;
  for (const t of tunnels) {
    const k = maalKind(t[0], maal);
    if (k && special[k] !== undefined && t.every((c) => maalKind(c, maal) === k)) {
      tunnelPts += special[k] ?? 0;
      b[k as "alter" | "poplu" | "jhiplu" | "joker"] -= 3;
    } else tunnelPts += s.tunnel;
  }
  b.marriages = Math.min(b.tiplu, b.poplu, b.jhiplu);
  b.preMaal = preMaal.filter((g) => isMarriage(g, maal)).length;
  const m = b.marriages;
  // Only when every marriage was shown before the maal; one in hand makes it a normal double.
  const marriageScale = b.preMaal && b.preMaal === m ? s.preMaalMarriage : s.marriage;
  b.points =
    tier(marriageScale, m) +
    tier(s.tiplu, b.tiplu - m) +
    tier(s.popluJhiplu, b.poplu - m) +
    tier(s.popluJhiplu, b.jhiplu - m) +
    tier(s.alter, b.alter) +
    tier(s.jokerPoints, b.joker) +
    b.bhoot * (s.bhootPoints ?? 0) +
    tunnelPts;
  return b;
}

export interface PlayerRoundInput {
  id: string;
  seen: boolean;
  cards: CardId[]; // every card they hold, shown or not
  shown: CardId[][]; // tunnels that score
  /** Pure sets shown to see the maal (for Pre-Maal marriages). */
  preMaal?: CardId[][];
}

export interface PlayerRoundResult {
  id: string;
  seen: boolean;
  maal: number; // maal points used in the calculation
  rawMaal: number; // maal points before murder/kidnap was applied
  breakdown: MaalBreakdown;
  points: number; // round result, sums to 0 across players
}

/**
 * Standard Nepali settlement: every pair of players settles the difference of their maal,
 * so each player gets N × own maal − total maal. On top, every other player pays the winner
 * `seenPoints` (saw the maal) or `unseenPoints` (didn't), plus a dublee bonus.
 */
export function scoreRound(
  players: PlayerRoundInput[],
  winnerId: string,
  maal: CardId,
  s: Settings,
  winByDublee: boolean,
): PlayerRoundResult[] {
  const rows: PlayerRoundResult[] = players.map((p) => {
    const breakdown = maalPoints(p.cards, p.shown, maal, s, p.preMaal);
    const counted = p.seen || s.unseenRule === "count";
    return { id: p.id, seen: p.seen, rawMaal: breakdown.points, maal: counted ? breakdown.points : 0, breakdown, points: 0 };
  });
  const winner = rows.find((r) => r.id === winnerId)!;
  if (s.unseenRule === "kidnap") for (const r of rows) if (!r.seen && r !== winner) winner.maal += r.rawMaal;

  const n = rows.length;
  const total = rows.reduce((a, r) => a + r.maal, 0);
  for (const r of rows) r.points = n * r.maal - total;
  for (const r of rows) {
    if (r === winner) continue;
    const bonus = (r.seen ? s.seenPoints : s.unseenPoints) + (winByDublee ? s.dubleeBonus : 0);
    r.points -= bonus;
    winner.points += bonus;
  }
  return rows;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/** Fewest payments that settle everyone's net balance (positive = is owed money). */
export function settle(net: Record<string, number>): Transfer[] {
  const round2 = (x: number) => Math.round(x * 100) / 100;
  const debtors = Object.entries(net).filter(([, v]) => v < -0.004).map(([id, v]) => ({ id, v: -v }));
  const creditors = Object.entries(net).filter(([, v]) => v > 0.004).map(([id, v]) => ({ id, v }));
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  const out: Transfer[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].v, creditors[j].v);
    if (amt > 0.004) out.push({ from: debtors[i].id, to: creditors[j].id, amount: round2(amt) });
    debtors[i].v -= amt;
    creditors[j].v -= amt;
    if (debtors[i].v < 0.005) i++;
    if (creditors[j].v < 0.005) j++;
  }
  return out;
}
