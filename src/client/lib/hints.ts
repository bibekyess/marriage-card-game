import { CardId, maalKind, MaalKind, sortBySuit } from "../../shared/cards";
import { findDubleeFinish, findDublees, findFinish, findPureSets, isTunnel } from "../../shared/melds";
import type { TableView } from "../../shared/protocol";
import { dubleesAllowed } from "../../shared/settings";

export const MAAL_TAG: Record<MaalKind, string> = { tiplu: "T", poplu: "P", jhiplu: "J", alter: "A", joker: "★" };
export const MAAL_NAME: Record<MaalKind, string> = {
  tiplu: "Tiplu",
  poplu: "Poplu",
  jhiplu: "Jhiplu",
  alter: "Alter",
  joker: "Joker",
};

export const tagFor = (id: CardId, maal: CardId | null) => {
  const k = maalKind(id, maal);
  return k ? MAAL_TAG[k] : null;
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
  canDeclare: boolean;
  finishDiscard: CardId | null;
}

/** What the player can do right now, worked out with the same rules the server enforces. */
export function computeHints(v: TableView): Hints {
  const myIndex = v.seats.findIndex((s) => s.id === v.you);
  const me = v.seats[myIndex];
  const myTurn = v.status === "playing" && v.turn === myIndex;
  const seen = me?.seen ?? null;
  const dubleeOk = dubleesAllowed(v.settings, v.seats.length);
  const pureSets = seen ? [] : findPureSets(v.hand, 3);
  const dublees = seen === "pure" ? [] : findDublees(v.hand);
  const discardPhase = myTurn && v.phase === "discard";
  let finish = null;
  if (discardPhase && seen === "pure") finish = findFinish(v.hand, v.maal, { forbidden: v.picked });
  if (discardPhase && seen === "dublee") finish = findDubleeFinish(v.hand, { forbidden: v.picked });
  return {
    myIndex,
    myTurn,
    seen,
    pureSets,
    dublees,
    dubleeOk,
    canShowPure: discardPhase && !seen && pureSets.length >= 3,
    canShowDublee: discardPhase && !seen && dubleeOk && dublees.length >= 7,
    canDeclare: !!finish,
    finishDiscard: finish?.discard ?? null,
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
