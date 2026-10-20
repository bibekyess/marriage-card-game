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

export const MELD_LABEL: Record<MeldType, string> = {
  tunnel: "Tunnela",
  pure: "Pure sequence",
  sequence: "Sequence",
  trial: "Trial",
  dublee: "Dublee",
};

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
 * Splits hands into groups that each satisfy `ok`. Groups are 3..5 cards: any longer valid
 * run can be split into shorter valid runs, so nothing is lost.
 *
 * Whether a group is valid depends only on its card faces (wild cards are interchangeable),
 * so the search is memoised on `keyOf` and equivalent groups are tried once. One partitioner
 * can be reused for several hands (e.g. every discard candidate) and shares its memo.
 */
export function partitioner(ok: (g: CardId[]) => boolean, keyOf: (id: CardId) => string = faceKey, maxSize = 5) {
  const memo = new Map<string, boolean>();
  const okMemo = new Map<string, boolean>();
  const key = (cs: CardId[]) => cs.map(keyOf).sort().join(",");
  const valid = (g: CardId[]) => {
    const k = key(g);
    let v = okMemo.get(k);
    if (v === undefined) okMemo.set(k, (v = ok(g)));
    return v;
  };

  /** Candidate first groups for `rest`, each with the cards left over. */
  function* firstGroups(rest: CardId[]): Generator<[CardId[], CardId[]]> {
    const [first, ...others] = rest;
    const tried = new Set<string>();
    for (let k = 2; k <= Math.min(maxSize - 1, others.length); k++) {
      const left = others.length - k;
      if (left !== 0 && left < 3) continue;
      for (const idx of combos(others.length, k)) {
        const g = [first, ...idx.map((i) => others[i])];
        const gk = key(g);
        if (tried.has(gk)) continue;
        tried.add(gk);
        if (!valid(g)) continue;
        const used = new Set(idx);
        yield [g, others.filter((_, i) => !used.has(i))];
      }
    }
  }

  const feasible = (rest: CardId[]): boolean => {
    if (!rest.length) return true;
    if (rest.length < 3) return false;
    const k = key(rest);
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    let res = false;
    for (const [, left] of firstGroups(rest)) {
      if (feasible(left)) {
        res = true;
        break;
      }
    }
    memo.set(k, res);
    return res;
  };

  const partition = (ids: CardId[]): CardId[][] | null => {
    if (!feasible(ids)) return null;
    const out: CardId[][] = [];
    let rest = ids;
    while (rest.length) {
      for (const [g, left] of firstGroups(rest)) {
        if (feasible(left)) {
          out.push(g);
          rest = left;
          break;
        }
      }
    }
    return out;
  };

  return { feasible, partition };
}

export function partition(ids: CardId[], ok: (g: CardId[]) => boolean, maxSize = 5): CardId[][] | null {
  return partitioner(ok, faceKey, maxSize).partition(ids);
}

const hasDuplicates = (ids: CardId[]) => new Set(ids).size !== ids.length;

/** All 3-card pure sets available in a hand. */
export function pureTriples(hand: CardId[]): CardId[][] {
  const out: CardId[][] = [];
  for (const idx of combos(hand.length, 3)) {
    const g = idx.map((i) => hand[i]);
    if (isPure(g)) out.push(g);
  }
  // Tunnels first: they are always safe to show.
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

/**
 * Find `want` pure sets to show (3, fewer if tunnels were shown at the start). A player may
 * pick the cards themselves; otherwise the best sets are found automatically.
 */
export function findShow(hand: CardId[], selected: CardId[] = [], want = 3): CardId[][] | null {
  if (selected.length) {
    if (selected.length !== want * 3 || hasDuplicates(selected) || !selected.every((c) => hand.includes(c))) return null;
    const g = partition(selected, isPure, 3);
    return g && g.length === want ? g : null;
  }
  const sets = findPureSets(hand, want);
  return sets.length >= want ? sets : null;
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
  if (selected.length) {
    if (selected.length !== need * 2 || hasDuplicates(selected) || !selected.every((c) => hand.includes(c))) return null;
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
  if (hasDuplicates(hand)) return null;
  const keyOf = (c: CardId) => (isWild(c, maal) ? "W" : faceKey(c));
  const p = partitioner((g) => isMeld(g, maal), keyOf);
  const cands = opts.preferDiscard ? [opts.preferDiscard] : hand;
  const tried = new Set<string>();
  for (const d of cands) {
    if (d === opts.forbidden || tried.has(keyOf(d))) continue;
    tried.add(keyOf(d));
    const groups = p.partition(hand.filter((x) => x !== d));
    if (groups) return { discard: d, groups };
  }
  return null;
}

/** Every distinct winning throw (one per card face), sharing one search. */
export function allFinishes(hand: CardId[], maal: CardId | null, opts: { forbidden?: CardId | null } = {}): Finish[] {
  if (hasDuplicates(hand)) return [];
  const keyOf = (c: CardId) => (isWild(c, maal) ? "W" : faceKey(c));
  const p = partitioner((g) => isMeld(g, maal), keyOf);
  const out: Finish[] = [];
  const tried = new Set<string>();
  for (const d of hand) {
    if (d === opts.forbidden || tried.has(faceKey(d))) continue;
    tried.add(faceKey(d));
    const groups = p.partition(hand.filter((x) => x !== d));
    if (groups) out.push({ discard: d, groups });
  }
  return out;
}

export function allDubleeFinishes(hand: CardId[], opts: { forbidden?: CardId | null } = {}): Finish[] {
  const out: Finish[] = [];
  const tried = new Set<string>();
  for (const d of hand) {
    if (d === opts.forbidden || tried.has(faceKey(d))) continue;
    tried.add(faceKey(d));
    const pairs = findDublees(hand.filter((x) => x !== d));
    if (pairs.length) out.push({ discard: d, groups: [pairs[0]] });
  }
  return out;
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
