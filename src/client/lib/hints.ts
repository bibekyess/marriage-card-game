import { CardId, maalKind, MaalKind, sortBySuit } from "../../shared/cards";
import { completesPure, findDublees, findPureSets, isTunnel } from "../../shared/melds";
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
  canShowPure: boolean;
  canShowDublee: boolean;
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
    canShowPure: myTurn && !seen && pureSets.length >= setsNeeded,
    canShowDublee: myTurn && !seen && dubleeOk && setsNeeded === 3 && dublees.length >= 7,
    setsNeeded,
    canDeclare: discardPhase && v.canDeclare,
    finishDiscard: v.finishDiscard,
    canPickDiscard,
  };
}

/** Put complete sets first (pure sets / dublees, or the winning layout), then the rest by suit. */
export function groupedOrder(v: TableView, h: Hints): CardId[] {
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
  return [...groups.flat(), ...rest.filter((c) => !maalKind(c, v.maal)), ...wilds];
}
