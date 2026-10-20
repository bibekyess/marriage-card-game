import { createHmac, randomBytes } from "node:crypto";
import type { Store } from "./db";

// A small append-only log of what happens on the server (tables opened, people joining, matches
// finished). Every event is printed as one readable line and handed to the store for the admin page.

export type EventType =
  | "visit"
  | "table.created"
  | "player.joined"
  | "player.left"
  | "player.reconnected"
  | "bot.added"
  | "match.started"
  | "round.won"
  | "match.ended"
  | "table.removed";

export interface GameEvent {
  /** Epoch milliseconds. */
  at: number;
  type: EventType;
  code?: string;
  name?: string;
  /** Short salted hash of the client address, never the address itself. */
  ipHash?: string;
  data?: Record<string, unknown>;
}

export interface PeriodStats {
  tables: number;
  matches: number;
  players: number;
  visitors: number;
}

export interface Stats {
  today: PeriodStats;
  week: PeriodStats;
  all: PeriodStats;
  /** Human players with the most finished matches. */
  top: { name: string; matches: number }[];
}

const LOG_GAP_MS = 30_000;
export const DAY_MS = 86_400_000;
/** Event writes allowed in flight; beyond this they are dropped so they can't hog the connection pool. */
const MAX_PENDING = 50;
/** A visitor counts once per this long. */
const VISIT_GAP_MS = 30 * 60_000;
const MAX_VISITORS_TRACKED = 10_000;
/** Visit rows allowed per minute in total, so a flood of addresses can't fill the table. */
const MAX_VISITS_PER_MINUTE = 60;

/**
 * What identifies a visitor: the IPv4 address, or the /64 network of an IPv6 one (one household or
 * host usually owns a whole /64, so it can't mint endless "new" visitors). IPv4-mapped addresses
 * count as IPv4.
 */
function network(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(":")) return ip;
  const [head, tail] = ip.split("%")[0].split("::");
  const groups = (x = "") => (x ? x.split(":") : []);
  const first = groups(head);
  const last = groups(tail);
  const all = tail === undefined ? first : [...first, ...Array(Math.max(0, 8 - first.length - last.length)).fill("0"), ...last];
  return `${all.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}/64`;
}

export class EventLog {
  private salt: string;
  private lastErr = 0;
  private writes = new Set<Promise<unknown>>();
  private dropped = 0;
  private lastVisit = new Map<string, number>();
  private minuteStart = 0;
  private minuteVisits = 0;

  /**
   * Addresses are only stored as HMAC(salt, ip). The salt is ADMIN_TOKEN when set, so the same
   * visitor hashes the same way across restarts and unique counts stay meaningful; otherwise it is
   * random per process (unique counts then only hold between restarts). Changing ADMIN_TOKEN
   * starts a fresh set of visitor hashes.
   */
  constructor(
    private store: Store,
    salt?: string,
  ) {
    this.salt = salt || randomBytes(16).toString("hex");
  }

  hash(ip: string | undefined) {
    return ip ? createHmac("sha256", this.salt).update(network(ip)).digest("hex").slice(0, 12) : undefined;
  }

  /** Print the event and store it in the background; never throws and never waits. */
  track(type: EventType, f: { code?: string; name?: string; ip?: string; data?: Record<string, unknown> } = {}) {
    const e: GameEvent = { at: Date.now(), type, code: f.code, name: f.name, ipHash: this.hash(f.ip), data: f.data };
    console.log(formatEvent(e));
    if (this.writes.size >= MAX_PENDING) {
      this.dropped++;
      this.fail("too many pending writes");
      return;
    }
    // The async wrapper also turns a synchronous throw from the store into a rejection.
    const write: Promise<unknown> = (async () => this.store.logEvent(e))()
      .catch((err) => this.fail((err as Error)?.message ?? err))
      .finally(() => this.writes.delete(write));
    this.writes.add(write);
  }

  /** Wait for writes in flight (used on shutdown, before the store closes). */
  async flush() {
    await Promise.all(this.writes);
  }

  /** Count a page load: once per visitor per half hour, and at most 60 a minute overall. */
  visit(ip: string | undefined) {
    const key = this.hash(ip);
    if (!key) return;
    const now = Date.now();
    if (now - (this.lastVisit.get(key) ?? 0) < VISIT_GAP_MS) return;
    if (now - this.minuteStart >= 60_000) {
      this.minuteStart = now;
      this.minuteVisits = 0;
    }
    if (this.minuteVisits >= MAX_VISITS_PER_MINUTE) return;
    this.minuteVisits++;
    if (this.lastVisit.size >= MAX_VISITORS_TRACKED) this.lastVisit.clear();
    this.lastVisit.set(key, now);
    this.track("visit", { ip });
  }

  private fail(why: unknown) {
    const now = Date.now();
    if (now - this.lastErr < LOG_GAP_MS) return;
    this.lastErr = now;
    console.error(`event log failed (${this.dropped} dropped so far):`, why);
  }
}

/** `2026-10-20T14:02:11Z table.created code=KQPM name="Ram" ip=ab12cd34ef56` */
export function formatEvent(e: GameEvent): string {
  const parts = [e.at ? new Date(e.at).toISOString().replace(/\.\d+Z$/, "Z") : "?", e.type];
  if (e.code) parts.push(`code=${e.code}`);
  if (e.name) parts.push(`name=${JSON.stringify(e.name)}`);
  if (e.ipHash) parts.push(`ip=${e.ipHash}`);
  for (const [k, v] of Object.entries(e.data ?? {})) parts.push(`${k}=${JSON.stringify(v)}`);
  return parts.join(" ");
}

/** Stats over an in-memory list of events (the memory store; Postgres computes the same in SQL). */
export function computeStats(events: GameEvent[], now = Date.now()): Stats {
  const startOfDay = now - (now % DAY_MS); // UTC midnight
  const period = (since: number): PeriodStats => {
    const names = new Set<string>();
    const visitors = new Set<string>();
    let tables = 0;
    let matches = 0;
    for (const e of events) {
      if (e.at < since) continue;
      if (e.type === "table.created") tables++;
      if (e.type === "match.ended") matches++;
      if (e.name && (e.type === "table.created" || e.type === "player.joined")) names.add(e.name);
      if (e.type === "visit" && e.ipHash) visitors.add(e.ipHash);
    }
    return { tables, matches, players: names.size, visitors: visitors.size };
  };
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "match.ended" || !Array.isArray(e.data?.players)) continue;
    for (const n of e.data.players) if (typeof n === "string") counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  // Same order as Postgres: most matches first, then by name (UTF-16 order here, byte order there;
  // they only differ for rare characters outside the basic plane).
  const top = [...counts]
    .map(([name, matches]) => ({ name, matches }))
    .sort((a, b) => b.matches - a.matches || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, 10);
  return { today: period(startOfDay), week: period(now - 7 * DAY_MS), all: period(0), top };
}
