import { CardId, maalKind, MaalKind, sortBySuit } from "../../shared/cards";
import { completesPure, findDubleeShow, findDublees, findPureSets, findShow, isTunnel } from "../../shared/melds";
import type { TableView } from "../../shared/protocol";
import { dubleesAllowed } from "../../shared/settings";

// One marker for every wild card: letters like "J" or "A" read as ranks on a card.
export const MAAL_TAG: Record<MaalKind, string> = { tiplu: "★", poplu: "★", jhiplu: "★", alter: "★", joker: "★" };
export const MAAL_NAME: Record<MaalKind, string> = {
  tiplu: "Tiplu",
  poplu: "Poplu",
  jhiplu: "Jhiplu",
  alter: "Alter",
  joker: "Joker",
};

export interface Hints {
  myIndex: number;
  myTurn: boolean;
  seen: "pure" | "dublee" | null;
  pureSets: CardId[][];
  dublees: CardId[][];
  dubleeOk: boolean;
  /** Pure sets still needed to see the maal. */
  setsNeeded: number;
  canDeclare: boolean;
  finishDiscard: CardId | null;
  /** Taking the top discard is allowed (pick-up rule). */
  canPickDiscard: boolean;
}

// Finding sets is cheap but not free; only redo it when the hand itself changes.
let setsCache: { key: string; pure: CardId[][]; dublees: CardId[][] } | null = null;
function setsFor(hand: CardId[], seen: string | null) {
  const key = hand.join() + "|" + seen;
  if (setsCache?.key !== key)
    setsCache = { key, pure: seen ? [] : findPureSets(hand, 3), dublees: seen === "pure" ? [] : findDublees(hand) };
  return setsCache;
}

/** What the player can do right now, worked out with the same rules the server enforces. */
export function computeHints(v: TableView): Hints {
  const myIndex = v.seats.findIndex((s) => s.id === v.you);
  const me = v.seats[myIndex];
  const myTurn = v.status === "playing" && v.turn === myIndex;
  const seen = me?.seen ?? null;
  const dubleeOk = dubleesAllowed(v.settings, v.seats.length);
  const { pure: pureSets, dublees } = setsFor(v.hand, seen);
  const discardPhase = myTurn && v.phase === "discard";
  const setsNeeded = v.setsNeeded ?? 3;
  const top = v.discardTop;
  const canPickDiscard = !!top && (!!seen || !v.settings.restrictPickup || completesPure(v.hand, top, dubleeOk));
  return {
    myIndex,
    myTurn,
    seen,
    pureSets,
    dublees,
    dubleeOk,
    setsNeeded,
    canDeclare: discardPhase && v.canDeclare,
    finishDiscard: v.finishDiscard,
    canPickDiscard,
  };
}

export interface ShowState {
  /** The button can be tapped: the selected cards make a valid show. */
  enabled: boolean;
  route: "pure" | "dublee";
  label: string;
  /** Why the button is disabled, or what to do next. */
  reason: string;
  /** Cards the app found for a valid show, for "Select for me". */
  suggestion: CardId[] | null;
}

/**
 * The Show button, worked out from the player's own selection: the app never picks the cards
 * by itself, it only explains what is missing and can suggest a selection.
 */
export function computeShowState(v: TableView, h: Hints, selected: Set<CardId>, active: boolean): ShowState | null {
  if (v.status !== "playing" || h.myIndex < 0 || h.seen) return null;
  const need = h.setsNeeded;
  const pureCards = need * 3;
  const dubleeOpen = h.dubleeOk && need === 3;
  const sel = [...selected];
  const done = 3 - need + Math.min(h.pureSets.length, need);
  if (!active) return { enabled: false, route: "pure", label: `Show · ${done}/3`, reason: h.myTurn ? "Reconnecting…" : "Wait for your turn to show.", suggestion: null };

  if (sel.length === pureCards && findShow(v.hand, sel, need))
    return { enabled: true, route: "pure", label: `Show ${need} pure`, reason: "Tap Show to see the maal.", suggestion: null };
  if (dubleeOpen && sel.length === 14 && findDubleeShow(v.hand, sel))
    return { enabled: true, route: "dublee", label: "Show 7 dublees", reason: "Tap Show to see the maal.", suggestion: null };

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const enoughPure = h.pureSets.length >= need;
  const enoughDublee = dubleeOpen && h.dublees.length >= 7;
  if (enoughPure || enoughDublee) {
    const route = enoughPure ? "pure" : "dublee";
    const count = route === "pure" ? pureCards : 14;
    const sets = route === "pure" ? plural(need, "pure set") : "7 dublees";
    return {
      enabled: false,
      route,
      label: `Show · ${sel.length}/${count}`,
      reason: sel.length === count ? `Those ${count} cards aren't ${sets}.` : `Select the ${count} cards of your ${sets}, then tap Show.`,
      suggestion: route === "pure" ? h.pureSets.slice(0, need).flat() : h.dublees.slice(0, 7).flat(),
    };
  }
  const missing = need - h.pureSets.length;
  const orDublee = dubleeOpen ? ` (or ${plural(7 - h.dublees.length, "more dublee")})` : "";
  return { enabled: false, route: "pure", label: `Show · ${done}/3`, reason: `You need ${plural(missing, "more pure set")}${orDublee} to see the maal.`, suggestion: null };
}

/** Complete sets found in the hand (pure sets / dublees, or natural sets once seen), then the rest by suit. */
export function groupedOrder(v: TableView, h: Hints): { order: CardId[]; groups: CardId[][] } {
  let groups: CardId[][] = [];
  if (!h.seen) groups = h.pureSets.length ? h.pureSets : h.dublees.length >= 3 ? h.dublees : [];
  else if (h.seen === "dublee") groups = h.dublees;
  else {
    // Pull out every natural tunnel and pure triple greedily; the rest sorted.
    groups = findPureSets(v.hand.filter((c) => !maalKind(c, v.maal)), 6).sort((a, b) => Number(isTunnel(b)) - Number(isTunnel(a)));
  }
  const used = new Set(groups.flat());
  const rest = sortBySuit(v.hand.filter((c) => !used.has(c)));
  const wilds = rest.filter((c) => maalKind(c, v.maal));
  return { order: [...groups.flat(), ...rest.filter((c) => !maalKind(c, v.maal)), ...wilds], groups };
}
