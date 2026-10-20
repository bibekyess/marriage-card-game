import { afterEach, describe, expect, it, vi } from "vitest";
import { io as connect, Socket } from "socket.io-client";
import pg from "pg";
import { MemoryStore, PgStore, Store } from "../src/server/db";
import { computeStats, DAY_MS, EventLog, GameEvent } from "../src/server/events";
import { startServer, ServerOptions } from "../src/server/index";
import { Table } from "../src/server/table";
import type { Ack, RoundRow } from "../src/shared/protocol";

const servers: Awaited<ReturnType<typeof startServer>>[] = [];
const sockets: Socket[] = [];

afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  for (const s of servers.splice(0)) await s.close();
});

async function boot(extra: Partial<ServerOptions> = {}) {
  const store = new MemoryStore();
  const srv = await startServer({ port: 0, store, delayScale: 0, clientDir: null, ...extra });
  servers.push(srv);
  return { srv, store, base: `http://localhost:${srv.port}` };
}

function call<T = any>(port: number, ev: string, payload: unknown): Promise<Ack<T>> {
  const s = connect(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true });
  sockets.push(s);
  return new Promise((r) => s.emit(ev, payload, r));
}

const types = async (store: MemoryStore) => (await store.recentEvents(50)).map((e) => e.type).reverse();

describe("event log", () => {
  it("records table creation, joins, bots and reconnects with hashed addresses", async () => {
    const { srv, store } = await boot();
    const made = await call(srv.port, "create", { name: "Ram", bots: 1 });
    const { code } = made.data;
    const joined = await call(srv.port, "join", { code, name: "Sita" });
    await call(srv.port, "resume", { code, token: joined.data.token });
    await new Promise((r) => setTimeout(r, 50));
    const ev = await store.recentEvents(50);
    const t = ev.map((e) => e.type);
    expect(t).toContain("table.created");
    expect(t).toContain("player.joined");
    expect(t).toContain("match.started");
    expect(ev.find((e) => e.type === "table.created")).toMatchObject({ code, name: "Ram" });
    expect(ev.find((e) => e.type === "player.joined")).toMatchObject({ code, name: "Sita" });
    const hash = ev.find((e) => e.type === "player.joined")!.ipHash!;
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.stringify(ev)).not.toContain("127.0.0.1");
    expect((await store.stats()).all.tables).toBe(1);
  });

  it("logs bots added in the lobby and a match that was started", async () => {
    const { srv, store } = await boot();
    const made = await call(srv.port, "create", { name: "Ram" });
    const s = connect(`http://localhost:${srv.port}`, { transports: ["websocket"], forceNew: true });
    sockets.push(s);
    const ack = (ev: string, p?: unknown) => new Promise<Ack>((r) => s.emit(ev, p, r));
    await ack("resume", { code: made.data.code, token: made.data.token });
    expect((await ack("addBot")).ok).toBe(true);
    expect((await ack("start")).ok).toBe(true);
    expect((await ack("endMatch")).ok).toBe(true);
    // No round was scored, so the match is not counted as finished.
    expect(await types(store)).toEqual(expect.arrayContaining(["bot.added", "match.started"]));
    expect((await store.stats()).all.matches).toBe(0);
  });

  it("counts a visitor once per half hour", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const store = new MemoryStore();
      const events = new EventLog(store, "salt");
      events.visit("1.1.1.1");
      events.visit("1.1.1.1");
      events.visit("2.2.2.2");
      vi.advanceTimersByTime(31 * 60_000);
      events.visit("1.1.1.1");
      await new Promise((r) => setImmediate(r));
      expect((await store.stats()).all.visitors).toBe(2);
      expect((await types(store)).filter((t) => t === "visit")).toHaveLength(3);
    } finally {
      vi.useRealTimers();
      log.mockRestore();
    }
  });

  it("treats an IPv6 /64 and IPv4-mapped addresses as one visitor, and caps visits per minute", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const store = new MemoryStore();
      const events = new EventLog(store, "salt");
      expect(events.hash("2001:db8:1:2:aaaa::1")).toBe(events.hash("2001:db8:1:2:bbbb:cccc:dddd:eeee"));
      expect(events.hash("2001:db8:1:2::1")).not.toBe(events.hash("2001:db8:1:3::1"));
      expect(events.hash("::ffff:1.2.3.4")).toBe(events.hash("1.2.3.4"));
      for (let i = 0; i < 200; i++) {
        events.visit(`10.0.${i >> 8}.${i & 255}`);
        await events.flush();
      }
      expect((await store.stats()).all.visitors).toBe(60);
    } finally {
      log.mockRestore();
    }
  });

  it("flush waits for writes in flight", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      let stored = 0;
      const slow = { logEvent: () => new Promise<void>((r) => setTimeout(() => (stored++, r()), 20)) } as unknown as Store;
      const events = new EventLog(slow, "salt");
      events.track("table.created", { code: "ABCD" });
      await events.flush();
      expect(stored).toBe(1);
    } finally {
      log.mockRestore();
    }
  });

  it("drops events instead of piling up writes when the store is slow", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      let writes = 0;
      const stuck = { logEvent: () => (writes++, new Promise<void>(() => {})) } as unknown as Store;
      const events = new EventLog(stuck, "salt");
      for (let i = 0; i < 80; i++) events.track("table.created", { code: "ABCD" });
      expect(writes).toBe(50);
      expect(err).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  });
});

describe("match stats", () => {
  function setup() {
    const { table: t, seat } = Table.create("ABCD", "Ram", {});
    const seen: { type: string; data?: Record<string, unknown> }[] = [];
    t.onEvent = (type, f) => seen.push({ type, data: f.data });
    const scoreRound = (winnerId = "someone") => t.s.rounds.push({ round: t.s.round, winnerId } as RoundRow);
    return { t, host: seat.id, seen, scoreRound, ended: () => seen.filter((e) => e.type === "match.ended") };
  }

  it("ignores a match where no round was won", () => {
    const { t, host, ended } = setup();
    t.addBot(host);
    t.start(host);
    t.endMatch(host);
    expect(ended()).toHaveLength(0);
  });

  it("ignores a match where every round was called off", () => {
    const { t, host, scoreRound, ended } = setup();
    t.addBot(host);
    t.start(host);
    scoreRound("");
    t.endMatch(host);
    expect(ended()).toHaveLength(0);
  });

  it("counts a scored match once and leaves out people who left", () => {
    const { t, host, scoreRound, ended } = setup();
    const { id } = t.join("Sita");
    t.start(host);
    scoreRound();
    t.leave(id);
    t.endMatch(host);
    t.endMatch(host);
    expect(ended()).toEqual([{ type: "match.ended", data: { players: ["Ram"], rounds: 1 } }]);
  });

  it("ends the old match when a new one is started mid-match", () => {
    const { t, host, seen, scoreRound } = setup();
    t.addBot(host);
    t.start(host);
    scoreRound();
    t.s.status = "roundEnd";
    t.newMatch(host);
    t.start(host);
    expect(seen.map((e) => e.type)).toEqual(["bot.added", "match.started", "match.ended", "match.started"]);
  });
});

// Runs only when a database is available, in a throwaway schema so existing data is untouched.
describe.skipIf(!process.env.TEST_DATABASE_URL)("postgres events", () => {
  it("gives the same stats as the memory store, lists newest first and prunes old visits", async () => {
    const url = process.env.TEST_DATABASE_URL!;
    const schema = `mg_test_${Date.now()}`;
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    const store = new PgStore(`${url}${url.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`);
    try {
      await store.init();
      const now = Date.now();
      const at = (ago: number) => now - ago;
      const ev = (ago: number, type: GameEvent["type"], f: Partial<GameEvent> = {}): GameEvent => ({ at: at(ago), type, ...f });
      const events: GameEvent[] = [
        ev(200 * DAY_MS, "visit", { ipHash: "aaa" }),
        ev(100 * DAY_MS, "visit", { ipHash: "bbb" }),
        ev(3 * DAY_MS, "table.created", { code: "ABCD", name: "Ram" }),
        ev(3 * DAY_MS, "player.joined", { code: "ABCD", name: "Sita" }),
        ev(3 * DAY_MS, "match.ended", { code: "ABCD", data: { players: ["Ram", "Sita"], rounds: 3 } }),
        ev(60_000, "visit", { ipHash: "bbb" }),
        ev(50_000, "visit", { ipHash: "ccc" }),
        ev(40_000, "table.created", { code: "WXYZ", name: "Zed" }),
        ev(30_000, "player.joined", { code: "WXYZ", name: "Ram" }),
        ev(20_000, "match.ended", { code: "WXYZ", data: { players: ["Zed", "Ram"], rounds: 2 } }),
        ev(10_000, "match.ended", { code: "WXYZ", data: { players: ["Bo", "Al"], rounds: 1 } }),
        ev(5_000, "bot.added", { code: "WXYZ", name: "Bot" }),
      ];
      for (const e of events) await store.logEvent(e);

      expect(await store.stats(now)).toEqual(computeStats(events, now));
      expect((await store.stats(now)).top.map((p) => p.name)).toEqual(["Ram", "Al", "Bo", "Sita", "Zed"]);
      expect(await store.recentEvents(50)).toEqual([...events].reverse());

      await store.pruneVisits(now - 90 * DAY_MS);
      const left = events.filter((e) => e.type !== "visit" || e.at >= now - 90 * DAY_MS);
      expect(await store.stats(now)).toEqual(computeStats(left, now));
      expect(await store.recentEvents(50)).toHaveLength(left.length);
    } finally {
      await store.close();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  });
});
