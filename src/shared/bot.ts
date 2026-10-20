import { card, CardId, faceKey, isWild, maalKind } from "./cards";
import {
  completesPure,
  findDubleeFinish,
  findDubleeShow,
  findDublees,
  findFinish,
  findPureSets,
  findShow,
  Finish,
  isMeld,
} from "./melds";
import { Route } from "./protocol";

// A simple, readable bot: it keeps cards that work together and throws the loneliest one.

export interface BotView {
  hand: CardId[];
  maal: CardId | null; // known only after seeing
  route: Route | null;
  dubleeAllowed: boolean;
  restrictPickup: boolean;
  discardTop: CardId | null;
  picked: CardId | null;
  /** Pure sets still needed to see the maal (fewer after showing tunnels at the start). */
  setsNeeded: number;
}

const rankGap = (a: number, b: number) =>
  Math.min(Math.abs(a - b), Math.abs((a === 1 ? 14 : a) - b), Math.abs(a - (b === 1 ? 14 : b)));

/** Whether a bot holding this hand should chase dublees instead of pure sets. */
export function prefersDublee(hand: CardId[], dubleeAllowed: boolean): boolean {
  if (!dubleeAllowed) return false;
  const pairs = findDublees(hand).length;
  return pairs >= 6 || (pairs >= 5 && findPureSets(hand, 3).length < 2);
}

/** How much each card is worth keeping. Higher = keep. */
export function cardValues(hand: CardId[], maal: CardId | null, route: Route | null, dubleeAllowed = false): Map<CardId, number> {
  const val = new Map<CardId, number>(hand.map((c) => [c, 0]));
  const seen = route !== null;
  const dubleeMode = route === "dublee" || (!seen && prefersDublee(hand, dubleeAllowed));

  if (dubleeMode) {
    for (const pair of findDublees(hand)) pair.forEach((c) => val.set(c, 50));
    if (maal) for (const c of hand) if (maalKind(c, maal) && maalKind(c, maal) !== "joker") val.set(c, val.get(c)! + 5);
    return val;
  }

  if (!seen) for (const g of findPureSets(hand, 3)) g.forEach((c) => val.set(c, 100));

  for (const a of hand) {
    if (val.get(a)! >= 100) continue;
    if (seen && isWild(a, maal)) {
      val.set(a, 1000);
      continue;
    }
    const ca = card(a);
    let v = 0;
    for (const b of hand) {
      if (a === b || (seen && isWild(b, maal))) continue;
      const cb = card(b);
      if (faceKey(a) === faceKey(b)) v += seen ? 1 : 4;
      else if (ca.suit === cb.suit) {
        const gap = rankGap(ca.rank, cb.rank);
        if (gap === 1) v += 4;
        else if (gap === 2) v += 2.5;
      } else if (seen && ca.rank === cb.rank) v += 3;
    }
    if (seen) {
      // Bonus for being in a complete set already.
      outer: for (const b of hand) for (const c of hand) {
        if (b === a || c === a || b >= c) continue;
        if (isMeld([a, b, c], maal)) {
          v += 8;
          break outer;
        }
      }
    }
    // Slight preference for throwing high cards early (they are harder to sequence).
    val.set(a, v - ca.rank * 0.01);
  }
  return val;
}

export function chooseDraw(v: BotView): "stock" | "discard" {
  const top = v.discardTop;
  if (!top) return "stock";
  const seen = v.route !== null;
  const dubleeMode = v.route === "dublee" || (!seen && prefersDublee(v.hand, v.dubleeAllowed));
  if (dubleeMode) return v.hand.some((c) => faceKey(c) === faceKey(top)) ? "discard" : "stock";
  if (!seen) return completesPure(v.hand, top, false) ? "discard" : "stock";
  if (isWild(top, v.maal)) return "discard";
  // Take it if it would make a complete set with two cards already held.
  const naturals = v.hand.filter((c) => !isWild(c, v.maal));
  for (let i = 0; i < naturals.length; i++)
    for (let j = i + 1; j < naturals.length; j++) if (isMeld([naturals[i], naturals[j], top], v.maal)) return "discard";
  return "stock";
}

export function chooseDiscard(v: BotView): CardId {
  const values = cardValues(v.hand, v.maal, v.route, v.dubleeAllowed);
  let best: CardId | null = null;
  let bestV = Infinity;
  for (const c of v.hand) {
    if (c === v.picked) continue;
    const x = values.get(c)! + Math.random() * 0.2;
    if (x < bestV) {
      bestV = x;
      best = c;
    }
  }
  return best ?? v.hand.find((c) => c !== v.picked) ?? v.hand[0];
}

export type BotPlan =
  | { kind: "declare"; finish: Finish }
  | { kind: "show"; route: Route; groups: CardId[][] }
  | { kind: "discard"; card: CardId };

/** Called on the bot's turn: declare, show, or throw a card. */
export function choosePlay(v: BotView): BotPlan {
  if (v.route === "pure") {
    const f = findFinish(v.hand, v.maal, { forbidden: v.picked });
    if (f) return { kind: "declare", finish: f };
  } else if (v.route === "dublee") {
    const f = findDubleeFinish(v.hand, { forbidden: v.picked });
    if (f) return { kind: "declare", finish: f };
  } else {
    const pure = findShow(v.hand, [], v.setsNeeded);
    if (pure) return { kind: "show", route: "pure", groups: pure };
    if (v.dubleeAllowed && v.setsNeeded === 3) {
      const d = findDubleeShow(v.hand);
      if (d) return { kind: "show", route: "dublee", groups: d };
    }
  }
  return { kind: "discard", card: chooseDiscard(v) };
}
