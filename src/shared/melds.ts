import { card, CardId, faceKey, isWild } from "./cards";

// ---------- single-group checks ----------

/** Ranks fit inside a run of `len` consecutive cards (ace may be low or high, no wrap-around). */
function fitsRun(ranks: number[], len: number): boolean {
  if (new Set(ranks).size !== ranks.length) return false;
  if (!ranks.length) return true;
  for (const aceHigh of [false, true]) {
    const v = ranks.map((r) => (r === 1 && aceHigh ? 14 : r));
    if (Math.max(...v) - Math.min(...v) + 1 <= len) return true;
  }
  return false;
}

export function isTunnel(ids: CardId[]): boolean {
  return ids.length === 3 && ids.every((x) => faceKey(x) === faceKey(ids[0])) && new Set(ids).size === 3;
}

/** Same suit, consecutive ranks, no wild cards used. */
export function isPureSequence(ids: CardId[]): boolean {
  if (ids.length < 3 || ids.length > 13) return false;
  const cs = ids.map(card);
  if (!cs.every((c) => c.suit === cs[0].suit)) return false;
  return fitsRun(cs.map((c) => c.rank), ids.length);
}

/** A "pure" set, usable for showing to see the maal. */
export function isPure(ids: CardId[]): boolean {
  return isTunnel(ids) || isPureSequence(ids);
}

/** Sequence where maal cards may stand in for missing ranks. */
export function isSequence(ids: CardId[], maal: CardId | null): boolean {
  if (ids.length < 3 || ids.length > 13) return false;
  if (isPureSequence(ids)) return true;
  const nat = ids.filter((x) => !isWild(x, maal)).map(card);
  if (!nat.length) return true;
  if (!nat.every((c) => c.suit === nat[0].suit)) return false;
  return fitsRun(nat.map((c) => c.rank), ids.length);
}

/** Three (or four) cards of one rank in different suits; maal cards can fill in. */
export function isTrial(ids: CardId[], maal: CardId | null): boolean {
  if (ids.length < 3 || ids.length > 4) return false;
  const nat = ids.filter((x) => !isWild(x, maal)).map(card);
  if (!nat.length) return true;
  return nat.every((c) => c.rank === nat[0].rank) && new Set(nat.map((c) => c.suit)).size === nat.length;
}

export function isMeld(ids: CardId[], maal: CardId | null): boolean {
  return isTunnel(ids) || isSequence(ids, maal) || isTrial(ids, maal);
}

export type MeldType = "tunnel" | "pure" | "sequence" | "trial" | "dublee";

export function meldType(ids: CardId[], maal: CardId | null): MeldType | null {
  if (ids.length === 2 && ids[0] !== ids[1] && faceKey(ids[0]) === faceKey(ids[1])) return "dublee";
  if (isTunnel(ids)) return "tunnel";
  if (isPureSequence(ids)) return "pure";
  if (isSequence(ids, maal)) return "sequence";
  if (isTrial(ids, maal)) return "trial";
  return null;
}

// ---------- partitioning ----------

function* combos(n: number, k: number, start = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === k) {
    yield acc;
    return;
  }
  for (let i = start; i <= n - (k - acc.length); i++) {
    acc.push(i);
    yield* combos(n, k, i + 1, acc);
    acc.pop();
  }
}

/**
 * Split all `ids` into groups that each satisfy `ok`. Groups are 3..5 cards: any longer
 * valid run can always be split into shorter valid runs, so this loses nothing.
 */
export function partition(ids: CardId[], ok: (g: CardId[]) => boolean, maxSize = 5): CardId[][] | null {
  const memo = new Map<string, CardId[][] | null>();
  const rec = (rest: CardId[]): CardId[][] | null => {
    if (!rest.length) return [];
    if (rest.length < 3) return null;
    const key = [...rest].sort().join(",");
    if (memo.has(key)) return memo.get(key)!;
    const [first, ...others] = rest;
    let res: CardId[][] | null = null;
    outer: for (let k = 2; k <= Math.min(maxSize - 1, others.length); k++) {
      if (others.length - k !== 0 && others.length - k < 3) continue;
      for (const idx of combos(others.length, k)) {
        const g = [first, ...idx.map((i) => others[i])];
        if (!ok(g)) continue;
        const used = new Set(idx);
        const sub = rec(others.filter((_, i) => !used.has(i)));
        if (sub) {
          res = [g, ...sub];
          break outer;
        }
      }
    }
    memo.set(key, res);
    return res;
  };
  return rec(ids);
}

/** All 3-card pure sets available in a hand. */
export function pureTriples(hand: CardId[]): CardId[][] {
  const out: CardId[][] = [];
  for (const idx of combos(hand.length, 3)) {
    const g = idx.map((i) => hand[i]);
    if (isPure(g)) out.push(g);
  }
  // Tunnels first: they score points when shown.
  return out.sort((a, b) => Number(isTunnel(b)) - Number(isTunnel(a)));
}

/** Up to `want` disjoint pure sets from the hand (largest found first). */
export function findPureSets(hand: CardId[], want = 3): CardId[][] {
  const triples = pureTriples(hand);
  let best: CardId[][] = [];
  const pick = (start: number, used: Set<CardId>, acc: CardId[][]): boolean => {
    if (acc.length > best.length) best = [...acc];
    if (acc.length >= want) return true;
    for (let i = start; i < triples.length; i++) {
      const g = triples[i];
      if (g.some((x) => used.has(x))) continue;
      g.forEach((x) => used.add(x));
      acc.push(g);
      const done = pick(i + 1, used, acc);
      acc.pop();
      g.forEach((x) => used.delete(x));
      if (done) return true;
    }
    return false;
  };
  pick(0, new Set(), []);
  return best;
}

/** Find 3 pure sets to show. If the player selected cards, only those are used. */
export function findShow(hand: CardId[], selected: CardId[] = []): CardId[][] | null {
  if (selected.length >= 9) {
    const g = partition(selected, isPure);
    return g && g.length >= 3 ? g : null;
  }
  const sets = findPureSets(hand, 3);
  return sets.length >= 3 ? sets : null;
}

/** All disjoint identical pairs in the hand. */
export function findDublees(hand: CardId[]): CardId[][] {
  const by = new Map<string, CardId[]>();
  for (const id of hand) {
    const k = faceKey(id);
    by.set(k, [...(by.get(k) || []), id]);
  }
  const out: CardId[][] = [];
  for (const ids of by.values()) for (let i = 0; i + 1 < ids.length; i += 2) out.push([ids[i], ids[i + 1]]);
  return out;
}

export function findDubleeShow(hand: CardId[], selected: CardId[] = [], need = 7): CardId[][] | null {
  if (selected.length === need * 2) {
    const d = findDublees(selected);
    return d.length === need ? d : null;
  }
  const d = findDublees(hand);
  return d.length >= need ? d.slice(0, need) : null;
}

export interface Finish {
  discard: CardId;
  groups: CardId[][];
}

/** A winning arrangement for a player who has seen the maal via pure sets. */
export function findFinish(
  hand: CardId[],
  maal: CardId | null,
  opts: { preferDiscard?: CardId; forbidden?: CardId | null } = {},
): Finish | null {
  const cands = opts.preferDiscard ? [opts.preferDiscard] : hand;
  for (const d of cands) {
    if (d === opts.forbidden) continue;
    const rest = hand.filter((x) => x !== d);
    const groups = partition(rest, (g) => isMeld(g, maal));
    if (groups) return { discard: d, groups };
  }
  return null;
}

/** A dublee player wins by holding one more dublee (8 in total). */
export function findDubleeFinish(
  hand: CardId[],
  opts: { preferDiscard?: CardId; forbidden?: CardId | null } = {},
): Finish | null {
  const cands = opts.preferDiscard ? [opts.preferDiscard] : hand;
  for (const d of cands) {
    if (d === opts.forbidden) continue;
    const pairs = findDublees(hand.filter((x) => x !== d));
    if (pairs.length) return { discard: d, groups: [pairs[0]] };
  }
  return null;
}

/** Whether a picked-up card completes a pure set (or dublee) with cards already in hand. */
export function completesPure(hand: CardId[], pick: CardId, allowDublee: boolean): boolean {
  if (allowDublee && hand.some((x) => faceKey(x) === faceKey(pick))) return true;
  for (let i = 0; i < hand.length; i++)
    for (let j = i + 1; j < hand.length; j++) if (isPure([hand[i], hand[j], pick])) return true;
  return false;
}
