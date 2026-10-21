import { CardId, maalKind, MaalKind, sortBySuit } from "../../shared/cards";
import { arrangeMelds, completesPure, findDubleeShow, findDublees, findFinish, findPureSets, findShow } from "../../shared/melds";
import { prefersDublee } from "../../shared/bot";
import { readingOrder } from "./groups";
import type { TableView } from "../../shared/protocol";
import { dubleesAllowed } from "../../shared/settings";

// One marker for every wild card: letters like "J" or "A" read as ranks on a card.
export const MAAL_TAG: Record<MaalKind, string> = { tiplu: "★", poplu: "★", jhiplu: "★", alter: "★", plain: "★", joker: "★", bhoot: "★" };
export const MAAL_NAME: Record<MaalKind, string> = {
  tiplu: "Tiplu",
  poplu: "Poplu",
  jhiplu: "Jhiplu",
  alter: "Alter",
  plain: "Plain wild",
  joker: "Joker",
  bhoot: "Bhoot",
};
/** Wild cards that score nothing get a silver star; point cards gold. */
export const isPointless = (k: MaalKind) => k === "plain" || k === "joker";

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

/** Dublees in the same order as the rest of the hand: by suit, then rank, printed pairs last. */
function pairsInOrder(pairs: CardId[][]): CardId[][] {
  const pos = new Map(sortBySuit(pairs.map((p) => p[0])).map((c, i) => [c, i]));
  return [...pairs].sort((a, b) => pos.get(a[0])! - pos.get(b[0])!);
}

/**
 * Complete sets found in the hand, then the rest by suit with wild cards last. Before seeing:
 * every pure set, or the dublees when chasing those (same judgement as the bots). Once seen:
 * the winning layout if there is one, else as many cards as possible in tunnels, sequences and
 * trials, wild cards filling gaps.
 */
export function groupedOrder(v: TableView, h: Hints): { order: CardId[]; groups: CardId[][] } {
  const isMaal = (c: CardId) => !!maalKind(c, v.maal);
  let groups: CardId[][];
  // Dublees can still be shown: allowed at this table, and no tunnela shown at the start.
  const dubleeOpen = h.dubleeOk && h.setsNeeded === 3;
  if (h.seen === "dublee") groups = pairsInOrder(h.dublees);
  else if (h.seen) {
    const finish = v.finishDiscard ? findFinish(v.hand, v.maal, { preferDiscard: v.finishDiscard }) : null;
    groups = finish?.groups ?? arrangeMelds(v.hand, v.maal);
  } else if (dubleeOpen && prefersDublee(v.hand, true)) groups = pairsInOrder(h.dublees);
  else {
    groups = arrangeMelds(v.hand, null, true);
    if (!groups.length && dubleeOpen) groups = pairsInOrder(h.dublees);
  }
  // Natural cards in reading order, wild cards at the end of their set.
  groups = groups.map((g) => [...readingOrder(g.filter((c) => !isMaal(c))), ...g.filter(isMaal)]);
  const used = new Set(groups.flat());
  const rest = sortBySuit(v.hand.filter((c) => !used.has(c)));
  return { order: [...groups.flat(), ...rest.filter((c) => !isMaal(c)), ...rest.filter(isMaal)], groups };
}
