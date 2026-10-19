import { randomBytes } from "node:crypto";
import { BotView, choosePlay, chooseDiscard, chooseDraw } from "../shared/bot";
import { cardLabel, CardId, faceKey, fullDeck, HAND_SIZE, isCardId, shuffle } from "../shared/cards";
import {
  allDubleeFinishes,
  allFinishes,
  completesPure,
  findDubleeFinish,
  findDubleeShow,
  findFinish,
  findShow,
  Finish,
} from "../shared/melds";
import { maalPoints, scoreRound } from "../shared/scoring";
import { LogEntry, RoundReveal, RoundRow, Route, TableStatus, TableView } from "../shared/protocol";
import { dubleesAllowed, MAX_PLAYERS, MIN_PLAYERS, sanitizeSettings, Settings } from "../shared/settings";

export class GameError extends Error {}
const fail = (msg: string): never => {
  throw new GameError(msg);
};

export interface SeatState {
  id: string;
  name: string;
  avatar: number;
  isBot: boolean;
  token: string;
  autoplay: boolean;
  /** Left mid-round: a bot plays for them and the seat goes at the next deal. */
  left?: boolean;
}

export interface RoundState {
  hands: Record<string, CardId[]>;
  stock: CardId[];
  discard: CardId[];
  maal: CardId;
  turn: number;
  phase: "draw" | "discard";
  drawn: CardId | null;
  picked: CardId | null;
  seen: Record<string, Route>;
  shown: Record<string, CardId[][]>;
  deadline: number | null;
  reshuffles?: number;
}

export interface TableState {
  code: string;
  hostId: string;
  practice: boolean;
  createdAt: number;
  updatedAt: number;
  settings: Settings;
  status: TableStatus;
  round: number;
  dealer: number;
  dealerId?: string;
  seats: SeatState[];
  spectators: { id: string; name: string; token: string }[];
  game: RoundState | null;
  rounds: RoundRow[];
  reveal: RoundReveal | null;
  log: LogEntry[];
  /** Names of everyone who has sat here this match (for scoreboards after people leave). */
  names?: Record<string, string>;
}

export const BOT_NAMES = ["Anisha", "Rohan", "Maya", "Sujan", "Kabir", "Pema"];
const OFFLINE_AUTOPLAY_MS = 45_000;
const HOST_HANDOVER_MS = 3 * 60_000;
const MAX_SPECTATORS = 10;
/** After this many stock reshuffles the round is called off (nobody can finish). */
const MAX_RESHUFFLES = 3;

export const newId = (bytes = 6) => randomBytes(bytes).toString("base64url");
export const cleanName = (n: unknown) =>
  Array.from((typeof n === "string" ? n : "").replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, "").replace(/\s+/g, " ").trim())
    .slice(0, 18)
    .join("")
    .trim() || "Player";

/** Any three identical cards held (they score as a tunnel). */
function tunnelsIn(hand: CardId[]): CardId[][] {
  const by = new Map<string, CardId[]>();
  for (const c of hand) by.set(faceKey(c), [...(by.get(faceKey(c)) || []), c]);
  return [...by.values()].filter((x) => x.length >= 3).map((x) => x.slice(0, 3));
}

export type NextStep = { kind: "bot" | "timeout"; at: number } | null;

export class Table {
  connected = new Set<string>();
  offlineSince = new Map<string, number>();
  /** When the last person disconnected (null while someone is here). */
  emptySince: number | null = Date.now();
  private finishCache: { key: string; result: Finish | null } | null = null;

  constructor(public s: TableState) {}

  static create(code: string, hostName: string, settings: Partial<Settings>, practiceBots = 0) {
    const host: SeatState = { id: newId(), name: cleanName(hostName), avatar: 0, isBot: false, token: newId(18), autoplay: false };
    const t = new Table({
      code,
      hostId: host.id,
      practice: practiceBots > 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings: sanitizeSettings(settings),
      status: "lobby",
      round: 0,
      dealer: 0,
      seats: [host],
      spectators: [],
      game: null,
      rounds: [],
      reveal: null,
      log: [],
    });
    for (let i = 0; i < practiceBots; i++) t.addBot(host.id);
    t.log(`${host.name} opened the table.`);
    return { table: t, seat: host };
  }

  // ---------- helpers ----------

  log(text: string) {
    this.s.log = [...this.s.log, { t: Date.now(), text }].slice(-40);
  }
  seat(id: string) {
    return this.s.seats.find((x) => x.id === id);
  }
  seatIndex(id: string) {
    return this.s.seats.findIndex((x) => x.id === id);
  }
  isHost(id: string) {
    return this.s.hostId === id;
  }
  requireHost(id: string) {
    if (!this.isHost(id)) fail("Only the host can do that.");
  }
  get g(): RoundState {
    return this.s.game ?? fail("No round is being played.");
  }
  private requireTurn(id: string, phase: "draw" | "discard") {
    if (this.s.status !== "playing") fail("The round isn't in play.");
    const g = this.g;
    if (this.s.seats[g.turn]?.id !== id) fail("It's not your turn.");
    if (g.phase !== phase) fail(phase === "draw" ? "You've already drawn — throw a card." : "Draw a card first.");
    return g;
  }
  private dubleeOk() {
    return dubleesAllowed(this.s.settings, this.s.seats.length);
  }
  private nameOf(id: string) {
    return this.seat(id)?.name ?? "Someone";
  }
  private nextAvatar() {
    const used = new Set(this.s.seats.map((x) => x.avatar));
    for (let i = 0; i < 12; i++) if (!used.has(i)) return i;
    return this.s.seats.length % 12;
  }

  // ---------- membership ----------

  byToken(token: string): string | null {
    const s = this.s.seats.find((x) => x.token === token) || this.s.spectators.find((x) => x.token === token);
    return s ? s.id : null;
  }

  join(name: string) {
    const nm = cleanName(name);
    const token = newId(18);
    const id = newId();
    const canSit = (this.s.status === "lobby" || this.s.status === "roundEnd") && this.s.seats.length < MAX_PLAYERS;
    if (canSit) {
      this.s.seats.push({ id, name: nm, avatar: this.nextAvatar(), isBot: false, token, autoplay: false });
      this.log(`${nm} joined the table.`);
    } else {
      if (this.s.spectators.length >= MAX_SPECTATORS) fail("This table is full.");
      this.s.spectators.push({ id, name: nm, token });
      this.log(`${nm} is watching${this.s.seats.length >= MAX_PLAYERS ? " (table is full)" : " and will join next round"}.`);
    }
    // A table whose host has gone (left with nobody to hand over to) gets a new host.
    if (!this.hostPresent()) {
      this.s.hostId = id;
      this.log(`${nm} is now the host.`);
    }
    return { id, token };
  }

  private hostPresent() {
    const h = this.s.seats.find((x) => x.id === this.s.hostId);
    return (h && !h.left) || this.s.spectators.some((x) => x.id === this.s.hostId);
  }

  /** Someone came back with their token: undo "left" so they keep their seat. */
  reclaim(id: string) {
    const seat = this.seat(id);
    if (seat?.left) {
      seat.left = false;
      seat.autoplay = false;
      this.log(`${seat.name} is back.`);
    }
    if (!this.hostPresent() && (seat || this.s.spectators.some((x) => x.id === id))) this.s.hostId = id;
  }

  addBot(by: string) {
    this.requireHost(by);
    if (this.s.status === "playing") fail("Add bots between rounds.");
    if (this.s.seats.length >= MAX_PLAYERS) fail(`A table seats at most ${MAX_PLAYERS} players.`);
    const used = new Set(this.s.seats.map((x) => x.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.s.seats.length}`;
    this.s.seats.push({ id: newId(), name, avatar: this.nextAvatar(), isBot: true, token: newId(18), autoplay: false });
    this.log(`${name} (bot) sat down.`);
  }

  removeSeat(by: string, id: string) {
    if (by !== id) this.requireHost(by);
    if (this.s.status === "playing") fail("Wait until the round is over.");
    if (id === this.s.hostId) fail("The host can't leave their own table.");
    const seat = this.seat(id);
    if (seat) {
      this.s.seats = this.s.seats.filter((x) => x.id !== id);
      this.log(`${seat.name} left the table.`);
    } else this.s.spectators = this.s.spectators.filter((x) => x.id !== id);
  }

  /** Someone pressed "Leave". Returns whether their seat is gone. */
  leave(id: string): { removed: boolean } {
    if (this.s.spectators.some((x) => x.id === id)) {
      this.s.spectators = this.s.spectators.filter((x) => x.id !== id);
      return { removed: true };
    }
    const seat = this.seat(id);
    if (!seat || seat.isBot) return { removed: false };
    if (this.s.hostId === id) this.handOverHost(id);
    if (this.s.status === "playing") {
      seat.autoplay = true;
      seat.left = true;
      this.log(`${seat.name} left — a bot is playing their cards.`);
      return { removed: true };
    }
    this.s.seats = this.s.seats.filter((x) => x.id !== id);
    this.log(`${seat.name} left the table.`);
    return { removed: true };
  }

  /** Give the host role to another person, preferring someone online. */
  private handOverHost(from: string) {
    const humans = [...this.s.seats.filter((x) => !x.isBot && x.id !== from && !x.left), ...this.s.spectators];
    const next = humans.find((x) => this.connected.has(x.id)) ?? humans[0];
    if (!next) return false;
    this.s.hostId = next.id;
    this.log(`${next.name} is now the host.`);
    return true;
  }

  /** If the host has been away a while between rounds, let someone else run the table. */
  maybeTransferHost(now = Date.now()): boolean {
    if (this.s.status === "playing" || this.connected.has(this.s.hostId)) return false;
    const since = this.offlineSince.get(this.s.hostId);
    if (since === undefined || now - since < HOST_HANDOVER_MS) return false;
    if (!this.s.seats.some((x) => !x.isBot && x.id !== this.s.hostId && this.connected.has(x.id))) return false;
    return this.handOverHost(this.s.hostId);
  }

  hasConnectedHumans() {
    return [...this.connected].some((id) => this.s.seats.some((x) => x.id === id && !x.isBot) || this.s.spectators.some((x) => x.id === id));
  }

  /** After a server restart, give the player whose turn it is time to reconnect. */
  extendDeadline(graceMs: number) {
    const g = this.s.game;
    if (g?.deadline) g.deadline = Math.max(g.deadline, Date.now() + graceMs);
  }

  setAutoplay(by: string, id: string, on: boolean) {
    if (by !== id) this.requireHost(by);
    const seat = this.seat(id) ?? fail("No such player.");
    if (seat.isBot) return;
    seat.autoplay = on;
    this.log(on ? `A bot is playing for ${seat.name}.` : `${seat.name} is back in control.`);
  }

  updateSettings(by: string, raw: Partial<Settings>) {
    this.requireHost(by);
    if (this.s.status === "playing") fail("Change rules between rounds.");
    this.s.settings = sanitizeSettings({ ...this.s.settings, ...raw }, this.s.settings);
  }

  setConnected(id: string, on: boolean) {
    if (on) {
      this.connected.add(id);
      this.offlineSince.delete(id);
    } else {
      this.connected.delete(id);
      this.offlineSince.set(id, Date.now());
    }
    this.emptySince = this.hasConnectedHumans() ? null : (this.emptySince ?? Date.now());
  }

  // ---------- round flow ----------

  start(by: string) {
    this.requireHost(by);
    if (this.s.status === "playing") fail("A round is already being played.");
    const staying = this.s.seats.filter((x) => !x.left).length;
    if (Math.min(MAX_PLAYERS, staying + this.s.spectators.length) < MIN_PLAYERS)
      fail("You need at least 2 players. Add a bot or invite someone.");
    if (this.s.status === "matchEnd") this.newMatch(by);
    this.s.seats = this.s.seats.filter((x) => !x.left);
    // Seat anyone who was waiting, if there's room.
    while (this.s.spectators.length && this.s.seats.length < MAX_PLAYERS) {
      const sp = this.s.spectators.shift()!;
      this.s.seats.push({ id: sp.id, name: sp.name, avatar: this.nextAvatar(), isBot: false, token: sp.token, autoplay: false });
    }
    this.deal();
  }

  newMatch(by: string) {
    this.requireHost(by);
    this.s.rounds = [];
    this.s.round = 0;
    this.s.names = {};
    this.s.reveal = null;
    this.s.status = "lobby";
    this.log("A new match is starting.");
  }

  endMatch(by: string) {
    this.requireHost(by);
    if (this.s.status === "playing") {
      this.s.game = null;
      this.log("The round was abandoned.");
    }
    this.s.status = "matchEnd";
    this.log("The host ended the match.");
  }

  private deal(rand?: (n: number) => number) {
    const n = this.s.seats.length;
    this.s.round += 1;
    // Round 1: the last seat deals, so the first seat plays first. Then the deal moves round the table.
    // If the previous dealer has left, the seat that moved into their place deals.
    const prev = this.s.dealerId ? this.s.seats.findIndex((x) => x.id === this.s.dealerId) : -1;
    if (this.s.round === 1 || this.s.dealer === undefined) this.s.dealer = n - 1;
    else this.s.dealer = prev >= 0 ? (prev + 1) % n : this.s.dealer % n;
    this.s.dealerId = this.s.seats[this.s.dealer].id;
    const stock = shuffle(fullDeck(), rand);
    const hands: Record<string, CardId[]> = {};
    for (const seat of this.s.seats) hands[seat.id] = stock.splice(0, HAND_SIZE);
    const maal = stock.splice(rand ? rand(stock.length) : Math.floor(Math.random() * stock.length), 1)[0];
    const discard = [stock.pop()!];
    this.s.game = {
      hands,
      stock,
      discard,
      maal,
      turn: (this.s.dealer + 1) % n,
      phase: "draw",
      drawn: null,
      picked: null,
      seen: {},
      shown: {},
      deadline: null,
    };
    this.s.reveal = null;
    this.s.status = "playing";
    this.armTimer();
    this.log(`Round ${this.s.round}: ${this.s.seats[this.s.dealer].name} dealt.`);
  }

  private armTimer() {
    const g = this.s.game;
    if (!g) return;
    const t = this.s.settings.turnTimer;
    g.deadline = t ? Date.now() + t * 1000 : null;
  }

  draw(id: string, from: "stock" | "discard") {
    const g = this.requireTurn(id, "draw");
    const hand = g.hands[id];
    let c: CardId;
    if (from === "discard") {
      const top = g.discard[g.discard.length - 1] ?? fail("The discard pile is empty.");
      if (!g.seen[id] && this.s.settings.restrictPickup && !completesPure(hand, top, this.dubleeOk()))
        fail("Before seeing the maal you can only pick up a card that completes a pure set" + (this.dubleeOk() ? " or a dublee." : "."));
      c = g.discard.pop()!;
      g.picked = c;
      this.log(`${this.nameOf(id)} picked up ${cardLabel(c)}.`);
    } else {
      if (!g.stock.length && (g.reshuffles ?? 0) >= MAX_RESHUFFLES) return this.voidRound();
      if (!g.stock.length) {
        g.reshuffles = (g.reshuffles ?? 0) + 1;
        const top = g.discard.pop()!;
        g.stock = shuffle(g.discard);
        g.discard = [top];
        this.log("The stock ran out — the discard pile was reshuffled.");
      }
      c = g.stock.pop() ?? fail("No cards left to draw.");
      g.picked = null;
    }
    hand.push(c);
    g.drawn = c;
    g.phase = "discard";
  }

  discard(id: string, c: CardId) {
    const g = this.requireTurn(id, "discard");
    const hand = g.hands[id];
    if (!isCardId(c) || !hand.includes(c)) fail("That card isn't in your hand.");
    if (c === g.picked) fail("You can't throw back the card you just picked up.");
    hand.splice(hand.indexOf(c), 1);
    g.discard.push(c);
    this.advance();
  }

  private advance() {
    const g = this.g;
    g.turn = (g.turn + 1) % this.s.seats.length;
    g.phase = "draw";
    g.drawn = null;
    g.picked = null;
    this.armTimer();
  }

  show(id: string, route: Route, selected: CardId[] = []) {
    const g = this.requireTurn(id, "discard");
    if (g.seen[id]) fail("You've already seen the maal.");
    const hand = g.hands[id];
    const sel = (Array.isArray(selected) ? selected : []).filter((c) => hand.includes(c));
    let groups: CardId[][] | null;
    if (route === "dublee") {
      if (!this.dubleeOk())
        fail(this.s.settings.dublees ? `Dublees need ${this.s.settings.dubleeMinPlayers}+ players.` : "Dublees are turned off at this table.");
      groups = findDubleeShow(hand, sel);
      if (!groups) fail("You need 7 dublees (pairs of identical cards) to show.");
    } else {
      groups = findShow(hand, sel);
      if (!groups)
        fail(
          sel.length === 9
            ? "Those cards don't make 3 pure sets."
            : sel.length
              ? "Select exactly 9 cards (your 3 sets), or none and the app will find them."
              : "You don't have 3 pure sequences or tunnels yet.",
        );
    }
    const used = new Set(groups!.flat());
    g.hands[id] = hand.filter((c) => !used.has(c));
    g.seen[id] = route;
    g.shown[id] = groups!;
    this.log(`${this.nameOf(id)} showed ${route === "dublee" ? "7 dublees" : "3 pure sets"} and saw the maal.`);
  }

  declare(id: string, preferDiscard?: CardId): void {
    const g = this.requireTurn(id, "discard");
    const route = g.seen[id] ?? fail("Show your sets and see the maal before declaring.");
    const hand = g.hands[id];
    const prefer = preferDiscard && hand.includes(preferDiscard) && preferDiscard !== g.picked ? preferDiscard : undefined;
    const opts = { preferDiscard: prefer, forbidden: g.picked };
    const f = prefer
      ? route === "dublee"
        ? findDubleeFinish(hand, opts)
        : findFinish(hand, g.maal, opts)
      : this.bestFinish(id);
    if (!f) {
      if (prefer) return this.declare(id); // try any other card before giving up
      fail(route === "dublee" ? "You need one more dublee to finish." : "Your cards don't make complete sets yet.");
    }
    this.finishRound(id, route, f!);
  }

  private finishRound(winnerId: string, route: Route, f: Finish) {
    const g = this.g;
    g.hands[winnerId] = g.hands[winnerId].filter((c) => c !== f.discard);
    g.discard.push(f.discard);
    // Tunnels score whether shown or still held at the end, for everyone alike
    // (so the winner's bonus never depends on how the cards happen to be arranged).
    const inputs = this.s.seats.map((seat) => {
      const hand = g.hands[seat.id];
      const shown = g.shown[seat.id] || [];
      return { id: seat.id, seen: !!g.seen[seat.id], cards: [...hand, ...shown.flat()], shown: [...shown, ...tunnelsIn(hand)] };
    });
    const rows = scoreRound(inputs, winnerId, g.maal, this.s.settings, route === "dublee");
    const points: Record<string, number> = {};
    const seen: Record<string, boolean> = {};
    for (const r of rows) {
      points[r.id] = r.points;
      seen[r.id] = r.seen;
    }
    this.s.rounds.push({ round: this.s.round, dealerId: this.s.seats[this.s.dealer].id, winnerId, route, points, seen, maal: g.maal });
    this.s.reveal = {
      winnerId,
      route,
      maal: g.maal,
      discard: f.discard,
      players: this.s.seats.map((seat, i) => ({
        id: seat.id,
        seen: rows[i].seen,
        shown: g.shown[seat.id] || [],
        groups: seat.id === winnerId ? f.groups : [],
        hand: seat.id === winnerId ? [] : g.hands[seat.id],
        maal: rows[i].maal,
        rawMaal: rows[i].rawMaal,
        breakdown: rows[i].breakdown,
        points: rows[i].points,
      })),
    };
    // Keep the winner's leftover cards (dublee route) visible too.
    if (route === "dublee") {
      const p = this.s.reveal.players.find((x) => x.id === winnerId)!;
      p.hand = g.hands[winnerId].filter((c) => !f.groups[0].includes(c));
    }
    this.s.game = null;
    const last = this.s.settings.rounds > 0 && this.s.round >= this.s.settings.rounds;
    this.s.status = last ? "matchEnd" : "roundEnd";
    this.log(`${this.nameOf(winnerId)} won round ${this.s.round}${route === "dublee" ? " with dublees" : ""}!`);
    if (last) this.log("That was the last round. Time to settle up!");
  }

  /** Called when the stock has run out too many times: nobody wins, nobody pays. */
  private voidRound() {
    const g = this.g;
    const points = Object.fromEntries(this.s.seats.map((x) => [x.id, 0]));
    const seen = Object.fromEntries(this.s.seats.map((x) => [x.id, !!g.seen[x.id]]));
    this.s.rounds.push({ round: this.s.round, dealerId: this.s.seats[this.s.dealer].id, winnerId: "", route: "pure", points, seen, maal: g.maal });
    const empty = { tiplu: 0, poplu: 0, jhiplu: 0, alter: 0, marriages: 0, tunnels: 0, points: 0 };
    this.s.reveal = {
      winnerId: "",
      route: "pure",
      maal: g.maal,
      discard: "",
      players: this.s.seats.map((x) => ({
        id: x.id,
        seen: !!g.seen[x.id],
        shown: g.shown[x.id] || [],
        groups: [],
        hand: g.hands[x.id],
        maal: 0,
        rawMaal: 0,
        breakdown: empty,
        points: 0,
      })),
    };
    this.s.game = null;
    const last = this.s.settings.rounds > 0 && this.s.round >= this.s.settings.rounds;
    this.s.status = last ? "matchEnd" : "roundEnd";
    this.log(`Round ${this.s.round} was called off — the stock ran out ${MAX_RESHUFFLES} times. No points.`);
  }

  arrange(id: string, order: CardId[]) {
    const g = this.s.game;
    if (!g || !g.hands[id] || !Array.isArray(order) || !order.every(isCardId)) return;
    const hand = g.hands[id];
    if (order.length !== hand.length) return;
    const a = [...hand].sort().join(), b = [...order].sort().join();
    if (a === b) g.hands[id] = [...order];
  }

  // ---------- automation (bots, timers, offline players) ----------

  botView(id: string): BotView {
    const g = this.g;
    return {
      hand: [...g.hands[id]],
      maal: g.seen[id] ? g.maal : null,
      route: g.seen[id] ?? null,
      dubleeAllowed: this.dubleeOk(),
      restrictPickup: this.s.settings.restrictPickup,
      discardTop: g.discard[g.discard.length - 1] ?? null,
      picked: g.picked,
    };
  }

  /** What should happen next without anyone clicking, and when. */
  nextStep(now = Date.now()): NextStep {
    if (this.s.status !== "playing" || !this.s.game) return null;
    const g = this.s.game;
    const seat = this.s.seats[g.turn];
    if (seat.isBot || seat.autoplay) {
      const base = { relaxed: 1700, normal: 1000, fast: 450 }[this.s.settings.botSpeed];
      return { kind: "bot", at: now + base * (g.phase === "draw" ? 0.8 : 1.1) };
    }
    let at = g.deadline ?? Infinity;
    const off = this.offlineSince.get(seat.id);
    if (!this.connected.has(seat.id)) at = Math.min(at, (off ?? now) + OFFLINE_AUTOPLAY_MS);
    return at === Infinity ? null : { kind: "timeout", at };
  }

  /** One automatic step for the player whose turn it is. */
  autoStep(kind: "bot" | "timeout") {
    const g = this.g;
    const seat = this.s.seats[g.turn];
    const id = seat.id;
    if (kind === "timeout") {
      // Human ran out of time (or went offline): draw from stock, then declare if the hand
      // is already complete, otherwise throw the weakest card.
      if (g.phase === "draw") this.draw(id, "stock");
      if (this.s.status !== "playing") return; // the round was called off
      const plan = g.seen[id] ? choosePlay(this.botView(id)) : null;
      if (plan?.kind === "declare") return this.declare(id); // best throw for points
      this.discard(id, chooseDiscard(this.botView(id)));
      this.log(`${seat.name} ran out of time — auto-played.`);
      return;
    }
    if (g.phase === "draw") {
      let from = chooseDraw(this.botView(id));
      try {
        this.draw(id, from);
      } catch {
        this.draw(id, "stock");
      }
      return;
    }
    let plan = choosePlay(this.botView(id));
    if (plan.kind === "show") {
      this.show(id, plan.route, plan.groups.flat());
      plan = choosePlay(this.botView(id));
      if (plan.kind === "show") plan = { kind: "discard", card: chooseDiscard(this.botView(id)) };
    }
    if (plan.kind === "declare") return this.declare(id);
    this.discard(id, plan.kind === "discard" ? plan.card : chooseDiscard(this.botView(id)));
  }

  // ---------- views ----------

  /**
   * Of all the cards that could be thrown to finish, the one that keeps the most maal points
   * (tunnels included), so the result never depends on how the hand happens to be ordered.
   */
  private bestFinish(id: string): Finish | null {
    const g = this.g;
    const hand = g.hands[id];
    const opts = { forbidden: g.picked };
    const all = g.seen[id] === "dublee" ? allDubleeFinishes(hand, opts) : allFinishes(hand, g.maal, opts);
    let best: Finish | null = null;
    let bestPts = -Infinity;
    const shown = g.shown[id] || [];
    for (const f of all) {
      const rest = hand.filter((c) => c !== f.discard);
      // Scored exactly as finishRound will score it.
      const pts = maalPoints([...rest, ...shown.flat()], [...shown, ...tunnelsIn(rest)], g.maal, this.s.settings).points;
      if (pts > bestPts) {
        bestPts = pts;
        best = f;
      }
    }
    return best;
  }

  /** Cached: can the player whose turn it is finish right now? */
  private finishFor(id: string): Finish | null {
    const g = this.s.game;
    if (!g || g.phase !== "discard" || this.s.seats[g.turn]?.id !== id || !g.seen[id]) return null;
    const key = `${id}|${g.hands[id].join()}|${g.picked}|${g.seen[id]}`;
    if (this.finishCache?.key !== key) this.finishCache = { key, result: this.bestFinish(id) };
    return this.finishCache.result;
  }

  view(id: string): TableView {
    const s = this.s, g = s.game;
    const seen = !!g?.seen[id];
    const names = (s.names ??= {});
    for (const x of s.seats) names[x.id] = x.name;
    const finish = this.finishFor(id);
    return {
      code: s.code,
      you: id,
      hostId: s.hostId,
      practice: s.practice,
      settings: s.settings,
      status: s.status,
      round: s.round,
      seats: s.seats.map((x) => ({
        id: x.id,
        name: x.name,
        avatar: x.avatar,
        isBot: x.isBot,
        connected: x.isBot || this.connected.has(x.id),
        autoplay: x.autoplay,
        cardCount: g ? g.hands[x.id]?.length ?? 0 : 0,
        seen: g?.seen[x.id] ?? null,
        shown: g?.shown[x.id] ?? [],
      })),
      dealer: s.dealer,
      turn: g?.turn ?? -1,
      phase: g?.phase ?? "draw",
      stockCount: g?.stock.length ?? 0,
      discardTop: g?.discard[g.discard.length - 1] ?? null,
      discardRecent: g?.discard.slice(-6) ?? [],
      maal: g && seen ? g.maal : null,
      maalHidden: !!g && !seen,
      hand: g?.hands[id] ?? [],
      drawn: g && s.seats[g.turn]?.id === id ? g.drawn : null,
      picked: g && s.seats[g.turn]?.id === id ? g.picked : null,
      deadline: g?.deadline ?? null,
      rounds: s.rounds,
      reveal: s.reveal,
      log: s.log.slice(-15),
      spectators: s.spectators.map((x) => ({ id: x.id, name: x.name })),
      names,
      serverNow: Date.now(),
      canDeclare: !!finish,
      finishDiscard: finish?.discard ?? null,
    };
  }

  /** Test hook: deal with a fixed random source. */
  _dealForTest(rand: (n: number) => number) {
    this.s.status = "lobby";
    this.deal(rand);
  }
}
