import { card, CardId, cardLabel, dubleeKey, faceKey, isBhoot, isPrinted, isWild } from "./cards";

/** The Bhoot is too valuable to give away: it can never be thrown. */
export const BHOOT_NO_THROW = "That's the Bhoot card, don't throw it.";

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

/** Three identical cards; the Bhoot may stand in for one of them. */
export function isTunnel(ids: CardId[]): boolean {
  if (ids.length !== 3 || new Set(ids).size !== 3) return false;
  const nat = ids.filter((x) => !isBhoot(x));
  if (nat.some(isPrinted)) return false;
  return nat.every((x) => faceKey(x) === faceKey(nat[0]));
}

/** Same suit, consecutive ranks. Only the Bhoot may fill a gap; maal cards count as their face. */
export function isPureSequence(ids: CardId[]): boolean {
  if (ids.length < 3 || ids.length > 13 || new Set(ids).size !== ids.length) return false;
  const nat = ids.filter((x) => !isBhoot(x));
  if (nat.some(isPrinted)) return false;
  const cs = nat.map(card);
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
  const natIds = ids.filter((x) => !isWild(x, maal));
  // A Joker before the maal is seen is a dead card: it fits nowhere.
  if (natIds.some(isPrinted)) return false;
  const nat = natIds.map(card);
  if (!nat.length) return true;
  if (!nat.every((c) => c.suit === nat[0].suit)) return false;
  return fitsRun(nat.map((c) => c.rank), ids.length);
}

/** Three (or four) cards of one rank in different suits; maal cards can fill in. */
export function isTrial(ids: CardId[], maal: CardId | null): boolean {
  if (ids.length < 3 || ids.length > 4) return false;
  const natIds = ids.filter((x) => !isWild(x, maal));
  if (natIds.some(isPrinted)) return false;
  const nat = natIds.map(card);
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
  if (ids.length === 2 && ids[0] !== ids[1] && dubleeKey(ids[0]) === dubleeKey(ids[1])) return "dublee";
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
  // Natural sets before ones that use the Bhoot (it's worth keeping free), tunnels first: always safe to show.
  const bhoot = (g: CardId[]) => Number(g.some(isBhoot));
  return out.sort((a, b) => bhoot(a) - bhoot(b) || Number(isTunnel(b)) - Number(isTunnel(a)));
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

/** Every natural tunnel (three identical cards) in a hand: the ones that can be shown at the start. */
export function findTunnels(hand: CardId[]): CardId[][] {
  const by = new Map<string, CardId[]>();
  for (const c of hand) if (!isPrinted(c)) by.set(faceKey(c), [...(by.get(faceKey(c)) || []), c]);
  return [...by.values()].filter((x) => x.length >= 3).map((x) => x.slice(0, 3));
}

/** All disjoint identical pairs in the hand (any two printed cards pair up too). */
export function findDublees(hand: CardId[]): CardId[][] {
  const by = new Map<string, CardId[]>();
  for (const id of hand) {
    const k = dubleeKey(id);
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

/**
 * Cards that are interchangeable when arranging a finish share a key. The Bhoot gets its own:
 * unlike other wild cards it can also complete a tunnel.
 */
const finishKey = (maal: CardId | null) => (c: CardId) => (isBhoot(c) ? "B" : isWild(c, maal) ? "W" : faceKey(c));

/** A winning arrangement for a player who has seen the maal via pure sets. */
export function findFinish(
  hand: CardId[],
  maal: CardId | null,
  opts: { preferDiscard?: CardId; forbidden?: CardId | null } = {},
): Finish | null {
  if (hasDuplicates(hand)) return null;
  const keyOf = finishKey(maal);
  const p = partitioner((g) => isMeld(g, maal), keyOf);
  const cands = opts.preferDiscard ? [opts.preferDiscard] : hand;
  const tried = new Set<string>();
  for (const d of cands) {
    if (d === opts.forbidden || isBhoot(d) || tried.has(keyOf(d))) continue;
    tried.add(keyOf(d));
    const groups = p.partition(hand.filter((x) => x !== d));
    if (groups) return { discard: d, groups };
  }
  return null;
}

/** Every distinct winning throw (one per card face), sharing one search. */
export function allFinishes(hand: CardId[], maal: CardId | null, opts: { forbidden?: CardId | null } = {}): Finish[] {
  if (hasDuplicates(hand)) return [];
  const p = partitioner((g) => isMeld(g, maal), finishKey(maal));
  const out: Finish[] = [];
  const tried = new Set<string>();
  for (const d of hand) {
    if (d === opts.forbidden || isBhoot(d) || tried.has(faceKey(d))) continue;
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
    if (d === opts.forbidden || isBhoot(d) || tried.has(faceKey(d))) continue;
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
    if (d === opts.forbidden || isBhoot(d)) continue;
    const pairs = findDublees(hand.filter((x) => x !== d));
    if (pairs.length) return { discard: d, groups: [pairs[0]] };
  }
  return null;
}

/**
 * Check a finish the player laid down themselves: their sets plus the card they throw.
 * Returns the finish, or the reason it isn't one.
 */
export function checkFinish(
  hand: CardId[],
  maal: CardId | null,
  route: "pure" | "dublee",
  groups: CardId[][],
  discard: CardId,
  forbidden?: CardId | null,
): Finish | string {
  const all = [...groups.flat(), discard];
  if (hasDuplicates(all) || !all.every((c) => hand.includes(c))) return "Those cards aren't all in your hand.";
  if (discard === forbidden) return "You can't throw back the card you just picked up.";
  if (isBhoot(discard)) return BHOOT_NO_THROW;
  if (route === "dublee") {
    if (groups.length !== 1 || meldType(groups[0], null) !== "dublee") return "Lay down one more dublee to finish.";
    return { discard, groups };
  }
  if (all.length !== hand.length) return "Lay down every card except the one you throw.";
  const bad = groups.find((g) => !isMeld(g, maal));
  if (bad) return `${bad.map(cardLabel).join(" ")} isn't a valid set.`;
  return { discard, groups };
}

/** Whether a picked-up card completes a pure set (or dublee) with cards already in hand. */
export function completesPure(hand: CardId[], pick: CardId, allowDublee: boolean): boolean {
  if (allowDublee && hand.some((x) => dubleeKey(x) === dubleeKey(pick))) return true;
  for (let i = 0; i < hand.length; i++)
    for (let j = i + 1; j < hand.length; j++) if (isPure([hand[i], hand[j], pick])) return true;
  return false;
}

// ---------- arranging a hand for display ----------

const MELD_ORDER: Record<MeldType, number> = { tunnel: 0, pure: 1, sequence: 2, trial: 3, dublee: 4 };

/**
 * The sets to group a hand into for the auto-arrange button: as many cards as possible in
 * complete sets (trials and wild-filled sets too, once seen), using as few wild cards as
 * possible. Cards that fit nowhere are left out. `pureOnly` (before the maal is seen) counts
 * only tunnels and pure sequences, with the Bhoot as the only wild card.
 */
export function arrangeMelds(hand: CardId[], maal: CardId | null, pureOnly = false): CardId[][] {
  const wild = (c: CardId) => (pureOnly ? isBhoot(c) : isWild(c, maal));
  const ok = (g: CardId[]) => (pureOnly ? isPure(g) : isMeld(g, maal));
  const nat = hand.filter((c) => !wild(c));
  const bhoot = hand.find(isBhoot) ?? null;
  const others = hand.filter((c) => wild(c) && !isBhoot(c));
  const typeOf = (g: CardId[]) => meldType(g, pureOnly ? null : maal) ?? "sequence";

  // Candidate sets, listed under their first card: three naturals, or two plus a wild card.
  // Sets with the same faces are interchangeable, so each is tried once.
  type Cand = { idx: number[]; wild: "any" | "bhoot" | null; score: number };
  const cands: Cand[][] = nat.map(() => []);
  const seen = new Set<string>();
  const add = (idx: number[], w: Cand["wild"], g: CardId[]) => {
    const k = idx[0] + ":" + idx.slice(1).map((i) => faceKey(nat[i])).join() + ":" + w;
    if (seen.has(k)) return;
    seen.add(k);
    cands[idx[0]].push({ idx: [...idx], wild: w, score: w ? 0 : 3 - MELD_ORDER[typeOf(g)] });
  };
  for (const idx of combos(nat.length, 3)) {
    const g = idx.map((i) => nat[i]);
    if (ok(g)) add(idx, null, g);
  }
  if (bhoot || others.length)
    for (const idx of combos(nat.length, 2)) {
      const g = idx.map((i) => nat[i]);
      if (others.length && ok([...g, others[0]])) add(idx, "any", g);
      else if (bhoot && ok([...g, bhoot])) add(idx, "bhoot", g);
    }
  for (const cs of cands) cs.sort((a, b) => Number(!!a.wild) - Number(!!b.wild) || b.score - a.score);

  // Depth-first over the naturals in order: each one starts a set or stays loose. Best = most
  // cards covered, then fewest wild cards used, then the purest sets. Capped to stay quick.
  type Pick = { idx: number[]; wild: CardId | null };
  let best = { covered: 0, wilds: 0, score: 0, picks: [] as Pick[] };
  const picks: Pick[] = [];
  const used = nat.map(() => false);
  let nodes = 0;
  const go = (i: number, covered: number, wilds: number, score: number, free: number, bh: boolean) => {
    if (++nodes > 50_000) return;
    while (i < nat.length && used[i]) i++;
    if (
      covered > best.covered ||
      (covered === best.covered && (wilds < best.wilds || (wilds === best.wilds && score > best.score)))
    )
      best = { covered, wilds, score, picks: [...picks] };
    if (i >= nat.length) return;
    const left = used.slice(i).filter((u) => !u).length;
    if (covered + left + free + Number(bh) < best.covered) return;
    for (const c of cands[i]) {
      if (c.idx.some((j) => used[j])) continue;
      let w: CardId | null = null;
      let f = free;
      let b = bh;
      if (c.wild === "any" && f) w = others[--f];
      else if (c.wild && b) [w, b] = [bhoot, false];
      else if (c.wild) continue;
      c.idx.forEach((j) => (used[j] = true));
      picks.push({ idx: c.idx, wild: w });
      go(i + 1, covered + c.idx.length + Number(!!w), wilds + Number(!!w), score + c.score, f, b);
      picks.pop();
      c.idx.forEach((j) => (used[j] = false));
    }
    go(i + 1, covered, wilds, score, free, bh);
  };
  go(0, 0, 0, 0, others.length, !!bhoot);

  const groups = best.picks.map((p) => [...p.idx.map((i) => nat[i]), ...(p.wild ? [p.wild] : [])]);
  // Grow sets with loose cards that extend them: a longer run, a fourth suit on a trial.
  const grouped = new Set(groups.flat());
  let loose = nat.filter((c) => !grouped.has(c));
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of loose) {
      const g = groups.find((g) => ok([...g, c]));
      if (!g) continue;
      g.push(c);
      loose = loose.filter((x) => x !== c);
      grew = true;
      break;
    }
  }
  return groups.sort((a, b) => MELD_ORDER[typeOf(a)] - MELD_ORDER[typeOf(b)]);
}
