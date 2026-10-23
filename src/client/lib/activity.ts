import type { Play, TableView } from "../../shared/protocol";
import { CardId, cardLabel } from "../../shared/cards";
import { nameOf } from "./format";

/** A stable key for a play, so new ones can be told apart from ones already seen. */
export const playKey = (p: Play) => `${p.t}:${p.round}:${p.by}:${p.kind}:${p.card ?? ""}`;

const who = (v: TableView, id: string) => (id === v.you ? "You" : nameOf(v, id));

/** One line for the activity log. `mine` marks moves about a card you threw. */
export function describePlay(v: TableView, p: Play): { text: string; mine: boolean } {
  const by = who(v, p.by);
  const card = p.card ? cardLabel(p.card) : "";
  const mine = !!p.from && p.from === v.you && p.by !== v.you;
  switch (p.kind) {
    case "throw":
      return { text: `${by} threw ${card}`, mine: false };
    case "pick":
      if (mine) return { text: `${by} picked up your ${card}`, mine };
      return { text: p.from && p.from !== p.by ? `${by} picked up ${card} from ${who(v, p.from)}` : `${by} picked up ${card}`, mine };
    case "stock":
      return { text: mine ? `${by} drew from stock, left your ${card}` : `${by} drew from stock`, mine };
    case "show":
      return { text: p.route === "dublee" ? `${by} showed ${p.sets ?? 7} dublees` : `${by} showed ${p.sets ?? 3} pure set${p.sets === 1 ? "" : "s"}`, mine: false };
    case "tunnel":
      return { text: `${by} showed ${p.sets ?? 1} tunnela`, mine: false };
    case "win":
      return { text: `${by} won, throwing ${card}`, mine: false };
  }
}

/** The newest reaction to a card you threw among plays you haven't seen yet. */
export function newReaction(v: TableView, plays: Play[], lastSeen: string | null): { by: string; card: CardId; taken: boolean } | null {
  const seen = lastSeen ? plays.findIndex((p) => playKey(p) === lastSeen) : -1;
  // Lost track (first view, or the old play scrolled out): only the very last play counts.
  const start = seen >= 0 ? seen + 1 : Math.max(0, plays.length - 1);
  for (let i = plays.length - 1; i >= start; i--) {
    const p = plays[i];
    if ((p.kind === "pick" || p.kind === "stock") && p.card && p.from === v.you && p.by !== v.you)
      return { by: nameOf(v, p.by), card: p.card, taken: p.kind === "pick" };
  }
  return null;
}

/** The card `seatId` took from the discard pile on the turn they're playing now, if any. */
export function pickedThisTurn(plays: Play[], round: number, seatId: string): CardId | null {
  for (let i = plays.length - 1; i >= 0; i--) {
    const p = plays[i];
    if (p.round !== round || p.by !== seatId) return null;
    if (p.kind === "pick") return p.card ?? null;
    // Showing sets doesn't end the turn; anything else means it moved on.
    if (p.kind !== "show" && p.kind !== "tunnel") return null;
  }
  return null;
}

/** The last `n` cards `seatId` took from the discard pile this round, oldest first. */
export function recentPicks(plays: Play[], round: number, seatId: string, n = 2): CardId[] {
  const picks: CardId[] = [];
  for (let i = plays.length - 1; i >= 0 && picks.length < n; i--) {
    const p = plays[i];
    if (p.round !== round) break;
    if (p.by === seatId && p.kind === "pick" && p.card) picks.unshift(p.card);
  }
  return picks;
}
