import { card, CardId, isPrinted, sortByRank } from "../../shared/cards";
import { MeldType } from "../../shared/melds";

// Groups are the player's own clusters of cards in the hand (a set they've put together).
// They live in the browser only; the server just keeps the card order.

export const GROUP_TAG: Record<MeldType, string> = {
  tunnel: "Tunnela",
  pure: "Pure",
  sequence: "Sequence",
  trial: "Trial",
  dublee: "Dublee",
};

/** Cards of a set in reading order; ace-high runs (Q K A) keep the ace last. */
export function readingOrder(ids: CardId[]): CardId[] {
  const sorted = sortByRank(ids);
  const set = sorted.filter((c) => !isPrinted(c));
  const printed = sorted.filter(isPrinted); // Jokers and the Bhoot go last
  if (!set.some((c) => card(c).rank === 13)) return [...set, ...printed];
  return [...set.filter((c) => card(c).rank !== 1), ...set.filter((c) => card(c).rank === 1), ...printed];
}

/** Drop groups whose cards left the hand (shown, thrown) and any card listed twice. */
export function cleanGroups(groups: CardId[][], hand: CardId[]): CardId[][] {
  const inHand = new Set(hand);
  const used = new Set<CardId>();
  const out: CardId[][] = [];
  for (const g of groups) {
    if (g.length < 2 || !g.every((c) => inHand.has(c) && !used.has(c))) continue;
    g.forEach((c) => used.add(c));
    out.push(g);
  }
  return out;
}

/** The hand order with every group first, in group order, then the loose cards. */
export function groupsFirst(order: CardId[], groups: CardId[][]): CardId[] {
  const grouped = new Set(groups.flat());
  return [...groups.flat(), ...order.filter((c) => !grouped.has(c))];
}

/** Make a new group from `ids`, taking those cards out of any group they were in. */
export function addGroup(groups: CardId[][], ids: CardId[]): CardId[][] {
  const taken = new Set(ids);
  const rest = groups.map((g) => g.filter((c) => !taken.has(c))).filter((g) => g.length >= 2);
  return [...rest, readingOrder(ids)];
}

/**
 * After a card was dragged to a new place: it stays in its group only if it landed next to
 * another card of that group (then the group takes the new order); otherwise it leaves the group.
 */
export function afterDrag(groups: CardId[][], next: CardId[], moved: CardId): CardId[][] {
  const pos = new Map(next.map((c, i) => [c, i]));
  return groups
    .map((g) => {
      if (!g.includes(moved)) return g;
      const i = pos.get(moved)!;
      const stays = g.some((c) => c !== moved && Math.abs(pos.get(c)! - i) === 1);
      const kept = stays ? g : g.filter((c) => c !== moved);
      return [...kept].sort((a, b) => pos.get(a)! - pos.get(b)!);
    })
    .filter((g) => g.length >= 2);
}

// Keyed by match too: a new match at the same table starts again at round 1.
const storeKey = (key: string) => `mg.groups:${key}`;

export function loadGroups(key: string): CardId[][] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(storeKey(key)) || "[]");
    return Array.isArray(raw) ? raw.filter((g) => Array.isArray(g) && g.every((c) => typeof c === "string")) : [];
  } catch {
    return [];
  }
}

export function saveGroups(key: string, groups: CardId[][]) {
  try {
    sessionStorage.setItem(storeKey(key), JSON.stringify(groups));
  } catch {}
}
