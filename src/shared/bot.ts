import { card, CardId, cardLabel, dubleeKey, faceKey, isBhoot, isPrinted, isWild, maalKind } from "./cards";
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
  isPure,
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
    for (const c of hand) {
      const k = maalKind(c, maal);
      if (k && k !== "plain") val.set(c, val.get(c)! + 5);
      // A lone printed card is half a dublee with the next one.
      else if (isPrinted(c) && val.get(c) === 0) val.set(c, 3);
    }
    return val;
  }

  if (!seen) for (const g of findPureSets(hand, 3)) g.forEach((c) => val.set(c, 100));

  for (const a of hand) {
    if (val.get(a)! >= 100) continue;
    if (isBhoot(a) || (seen && isWild(a, maal))) {
      val.set(a, 1000);
      continue;
    }
    // A Joker is dead until the maal is seen, then wild: worth holding on to.
    if (isPrinted(a)) {
      val.set(a, 6);
      continue;
    }
    const ca = card(a);
    let v = 0;
    for (const b of hand) {
      if (a === b || isPrinted(b) || (seen && isWild(b, maal))) continue;
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
  if (dubleeMode) return v.hand.some((c) => dubleeKey(c) === dubleeKey(top)) ? "discard" : "stock";
  if (!seen) return completesPure(v.hand, top, false) ? "discard" : "stock";
  if (isWild(top, v.maal)) return "discard";
  // Take it if it would make a complete set with two cards already held.
  const naturals = v.hand.filter((c) => !isWild(c, v.maal));
  for (let i = 0; i < naturals.length; i++)
    for (let j = i + 1; j < naturals.length; j++) if (isMeld([naturals[i], naturals[j], top], v.maal)) return "discard";
  return "stock";
}

/** The card to throw. `jitter` breaks ties at random (bots); tips leave it off so they don't flicker. */
export function chooseDiscard(v: BotView, jitter = true): CardId {
  const values = cardValues(v.hand, v.maal, v.route, v.dubleeAllowed);
  let best: CardId | null = null;
  let bestV = Infinity;
  for (const c of v.hand) {
    if (c === v.picked || isBhoot(c)) continue;
    const x = values.get(c)! + (jitter ? Math.random() * 0.2 : 0);
    if (x < bestV) {
      bestV = x;
      best = c;
    }
  }
  return best ?? v.hand.find((c) => c !== v.picked && !isBhoot(c)) ?? v.hand[0];
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

// ---------- tips for human players (same judgement as the bots) ----------

export interface Tip {
  /** The card to throw, for a discard tip. */
  card?: CardId;
  /** Which pile to draw from, for a draw tip. */
  pile?: "stock" | "discard";
  text: string;
}

const labels = (ids: CardId[]) => ids.map(cardLabel).join(" ");

/** Cards in the hand that work with `a`: same face, or same suit within two ranks (or same rank once seen). */
function neighbours(hand: CardId[], a: CardId, maal: CardId | null, seen: boolean): CardId[] {
  if (isPrinted(a)) return [];
  const ca = card(a);
  return hand.filter((b) => {
    if (b === a || isPrinted(b) || (seen && isWild(b, maal))) return false;
    const cb = card(b);
    if (faceKey(a) === faceKey(b)) return true;
    if (ca.suit === cb.suit) return rankGap(ca.rank, cb.rank) <= 2;
    return seen && ca.rank === cb.rank;
  });
}

/** Which card to throw, and why. */
export function discardTip(v: BotView): Tip {
  const c = chooseDiscard(v, false);
  const seen = v.route !== null;
  const dubleeMode = v.route === "dublee" || (!seen && prefersDublee(v.hand, v.dubleeAllowed));
  if (dubleeMode) return { card: c, text: `Throw ${cardLabel(c)}: it isn't part of a dublee.` };
  if (!seen && findPureSets(v.hand, 3).some((g) => g.includes(c)))
    return { card: c, text: `Every card is in a set; ${cardLabel(c)} breaks the least.` };
  const near = neighbours(v.hand, c, v.maal, seen);
  if (!near.length) return { card: c, text: `Throw ${cardLabel(c)}: it doesn't connect with any of your cards.` };
  return { card: c, text: `Throw ${cardLabel(c)}: it's your weakest link (only ${labels(near.slice(0, 2))} nearby).` };
}

/** Which pile to draw from, and why. */
export function drawTip(v: BotView): Tip {
  const top = v.discardTop;
  if (!top || chooseDraw(v) === "stock") return { pile: "stock", text: "Draw from the stock: the discard doesn't help you." };
  const seen = v.route !== null;
  const t = cardLabel(top);
  const same = v.hand.find((c) => dubleeKey(c) === dubleeKey(top));
  if (v.route === "dublee" || (!seen && prefersDublee(v.hand, v.dubleeAllowed)))
    return { pile: "discard", text: `Take the ${t}: it makes a dublee with your ${cardLabel(same!)}.` };
  if (seen && isWild(top, v.maal)) return { pile: "discard", text: `Take the ${t}: it's a wild card.` };
  const ok = (a: CardId, b: CardId) => (seen ? isMeld([a, b, top], v.maal) : isPure([a, b, top]));
  const hand = seen ? v.hand.filter((c) => !isWild(c, v.maal)) : v.hand;
  for (let i = 0; i < hand.length; i++)
    for (let j = i + 1; j < hand.length; j++)
      if (ok(hand[i], hand[j])) return { pile: "discard", text: `Take the ${t}: it completes ${labels([hand[i], hand[j]])}.` };
  return { pile: "discard", text: `Take the ${t}.` };
}
