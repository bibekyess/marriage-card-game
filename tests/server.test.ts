import { afterEach, describe, expect, it } from "vitest";
import { io as connect, Socket } from "socket.io-client";
import { MemoryStore, PgStore, Store } from "../src/server/db";
import type { Stats } from "../src/server/events";
import { startServer } from "../src/server/index";
import type { TableState } from "../src/server/table";
import type { Ack, TableView } from "../src/shared/protocol";

/** Store that survives a server restart within one test (stands in for Postgres). */
class SharedStore implements Store {
  data = new Map<string, string>();
  async init() {}
  async remove(code: string) {
    this.data.delete(code);
  }
  async save(s: TableState) {
    this.data.set(s.code, JSON.stringify(s));
  }
  async close() {}
  async logEvent() {}
  async pruneVisits() {}
  async stats(): Promise<Stats> {
    const z = { tables: 0, matches: 0, players: 0, visitors: 0 };
    return { today: z, week: z, all: z, top: [] };
  }
  async recentEvents() {
    return [];
  }
  async loadActive() {
    return [...this.data.values()].map((x) => JSON.parse(x) as TableState);
  }
}

type Srv = Awaited<ReturnType<typeof startServer>>;
const servers: Srv[] = [];
const sockets: Socket[] = [];

afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  for (const s of servers.splice(0)) await s.close();
});

async function server(store: Store = new MemoryStore()) {
  const s = await startServer({ port: 0, store, delayScale: 0, clientDir: null, adminToken: "", umamiDashboardUrl: "" });
  servers.push(s);
  return s;
}

function client(port: number) {
  const s = connect(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true });
  sockets.push(s);
  let latest: TableView | null = null;
  const waiters: [(v: TableView) => boolean, (v: TableView) => void][] = [];
  s.on("state", (v: TableView) => {
    latest = v;
    for (const w of [...waiters]) if (w[0](v)) {
      waiters.splice(waiters.indexOf(w), 1);
      w[1](v);
    }
  });
  return {
    socket: s,
    get view() {
      return latest!;
    },
    call<T = any>(ev: string, payload?: unknown): Promise<Ack<T>> {
      return new Promise((r) => s.emit(ev, payload, r));
    },
    until(pred: (v: TableView) => boolean, ms = 5000): Promise<TableView> {
      if (latest && pred(latest)) return Promise.resolve(latest);
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error("timed out waiting for state")), ms);
        waiters.push([pred, (v) => (clearTimeout(t), res(v))]);
      });
    },
  };
}

describe("socket server", () => {
  it("lets two people play, keeps hands private, and resumes after a refresh", async () => {
    const srv = await server();
    const host = client(srv.port);
    const made = await host.call("create", { name: "Bibek", settings: { restrictPickup: false } });
    expect(made.ok).toBe(true);
    const { code } = made.data;

    const guest = client(srv.port);
    const joined = await guest.call("join", { code: code.toLowerCase(), name: "Sita" });
    expect(joined.ok).toBe(true);
    await host.until((v) => v.seats.length === 2);

    expect((await guest.call("start")).error).toMatch(/host/);
    expect((await host.call("start")).ok).toBe(true);
    const hv = await host.until((v) => v.status === "playing");
    const gv = await guest.until((v) => v.status === "playing");
    expect(hv.hand).toHaveLength(21);
    expect(gv.hand).toHaveLength(21);
    expect(hv.maal).toBeNull();
    expect(JSON.stringify(gv)).not.toContain(JSON.stringify(hv.hand));

    // Host (seat 0) plays first.
    expect(hv.turn).toBe(0);
    expect((await guest.call("draw", { from: "stock" })).error).toMatch(/not your turn/);
    expect((await host.call("draw", { from: "stock" })).ok).toBe(true);
    const afterDraw = await host.until((v) => v.phase === "discard");
    const throwCard = afterDraw.drawn!;
    expect((await host.call("discard", { card: throwCard })).ok).toBe(true);
    await guest.until((v) => v.turn === 1 && v.discardTop === throwCard);

    // Guest "refreshes": new socket, resume with saved token, same seat and same cards.
    const handBefore = guest.view.hand;
    guest.socket.disconnect();
    await host.until((v) => v.seats[1].connected === false);
    const again = client(srv.port);
    const resumed = await again.call("resume", { code, token: joined.data.token });
    expect(resumed.ok).toBe(true);
    expect(resumed.data.playerId).toBe(joined.data.playerId);
    const back = await again.until((v) => v.status === "playing");
    expect(back.hand).toEqual(handBefore);
    expect(back.you).toBe(joined.data.playerId);
    await host.until((v) => v.seats[1].connected === true);

    // A bad token gets nothing.
    expect((await client(srv.port).call("resume", { code, token: "nope" })).ok).toBe(false);
  });

  it("restores tables after a server restart", async () => {
    const store = new SharedStore();
    const srv1 = await server(store);
    const host = client(srv1.port);
    const made = await host.call("create", { name: "Bibek" });
    const guest = client(srv1.port);
    await guest.call("join", { code: made.data.code, name: "Ram" });
    await host.call("start");
    const hand = (await host.until((v) => v.status === "playing")).hand;
    await srv1.close();

    const srv2 = await server(store);
    const host2 = client(srv2.port);
    const r = await host2.call("resume", { code: made.data.code, token: made.data.token });
    expect(r.ok).toBe(true);
    const v = await host2.until((x) => x.status === "playing");
    expect(v.hand).toEqual(hand);
  });

  it("plays a full practice match against bots", async () => {
    const srv = await server();
    const me = client(srv.port);
    const made = await me.call("create", { name: "Me", bots: 3, settings: { rounds: 2 } });
    expect(made.ok).toBe(true);
    await me.until((v) => v.status === "playing" && v.seats.length === 4);
    // Let a bot play my seat too, then deal the second round when the first ends.
    await me.call("autoplay", { on: true });
    await me.until((v) => v.status === "roundEnd" || v.status === "matchEnd", 20000);
    if (me.view.status === "roundEnd") {
      expect(me.view.reveal?.players).toHaveLength(4);
      await me.call("start");
    }
    const end = await me.until((v) => v.status === "matchEnd", 20000);
    expect(end.rounds).toHaveLength(2);
    for (const r of end.rounds) expect(Object.values(r.points).reduce((a, b) => a + b, 0)).toBe(0);
  }, 30000);

  it("reports a table's public status for 'Your tables'", async () => {
    const srv = await server();
    const c = client(srv.port);
    const made = await c.call("create", { name: "Host", bots: 1 });
    const status = (code: string, token: string) =>
      fetch(`http://localhost:${srv.port}/api/tables/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).then((r) => r.json());
    const info = await status(made.data.code, made.data.token);
    expect(info).toMatchObject({ exists: true, status: "playing", round: 1, players: ["Host", "Anisha"] });
    expect(JSON.stringify(info)).not.toMatch(/token|hand/i);
    // Without your seat token, or for an unknown code, nothing is revealed.
    expect(await status(made.data.code, "wrong")).toEqual({ exists: false });
    expect(await status("ZZZZ", made.data.token)).toEqual({ exists: false });
    expect(await status(made.data.code.toLowerCase(), made.data.token)).toMatchObject({ exists: true });
  });

  it("rate-limits 'Your tables' per real address only when TRUST_PROXY is set", async () => {
    const hit = (port: number, from: string) =>
      fetch(`http://localhost:${port}/api/tables/ZZZZ`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": from },
        body: "{}",
      }).then((r) => r.status);
    const burst = async (port: number, from: string) => {
      for (let i = 0; i < 60; i++) expect(await hit(port, from)).toBe(200);
      expect(await hit(port, from)).toBe(429);
    };
    // Without it the header is ignored, so a new forwarded address doesn't reset the limit.
    const plain = await server();
    await burst(plain.port, "1.1.1.1");
    expect(await hit(plain.port, "2.2.2.2")).toBe(429);
    // With it each forwarded address gets its own limit.
    process.env.TRUST_PROXY = "1";
    try {
      const proxied = await server();
      await burst(proxied.port, "1.1.1.1");
      expect(await hit(proxied.port, "2.2.2.2")).toBe(200);
    } finally {
      delete process.env.TRUST_PROXY;
    }
  });

  it("tells people when a code doesn't exist", async () => {
    const srv = await server();
    const c = client(srv.port);
    const r = await c.call("join", { code: "ZZZZ", name: "X" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/No table/);
  });
});

describe("robustness", () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("survives malformed payloads", async () => {
    const srv = await server();
    const c = client(srv.port);
    expect((await c.call("join", { code: {}, name: {} })).ok).toBe(false);
    expect((await c.call("join", null)).ok).toBe(false);
    expect((await c.call("resume", { code: [], token: 5 })).ok).toBe(false);
    const made = await c.call("create", { name: "A", settings: { turnTimer: {} }, bots: { toString: 1, valueOf: 1 } });
    expect(made.ok).toBe(true);
    c.socket.emit("create"); // no payload, no ack
    c.socket.emit("draw", { from: { toString: 1, valueOf: 1 } });
    expect((await c.call("settings", { settings: "x" })).ok).toBe(false);
    expect((await c.call("autoplay", { on: {} })).ok).toBe(false);
    const bots = client(srv.port);
    await bots.call("create", { name: "B", bots: 2 });
    await bots.until((v) => v.status === "playing");
    expect((await bots.call("arrange", { order: [[1]] })).ok).toBe(false);
    expect((await bots.call("show", { route: {}, cards: [{}] })).ok).toBe(false);
    expect((await bots.call("discard", { card: { a: 1 } })).ok).toBe(false);
    const health = await fetch(`http://localhost:${srv.port}/api/health`);
    expect(health.status).toBe(200);
    expect((await fetch(`http://localhost:${srv.port}/api/nope`)).status).toBe(404);
  });

  it("answers create before sending the first state", async () => {
    const srv = await server();
    const s = connect(`http://localhost:${srv.port}`, { transports: ["websocket"], forceNew: true });
    sockets.push(s);
    const order: string[] = [];
    s.on("state", () => order.push("state"));
    await new Promise<void>((r) => s.emit("create", { name: "X" }, () => (order.push("ack"), r())));
    await wait(100);
    expect(order[0]).toBe("ack");
    expect(order).toContain("state");
  });

  it("rate limits create and join", async () => {
    const srv = await server();
    const c = client(srv.port);
    expect((await c.call("create", { name: "A" })).ok).toBe(true);
    const second = await c.call("create", { name: "A" });
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/too fast/);
    const j1 = await c.call("join", { code: "ZZZZ", name: "A" });
    const j2 = await c.call("join", { code: "ZZZZ", name: "A" });
    expect(j1.error).toMatch(/No table/);
    expect(j2.error).toMatch(/too fast/);
  });

  it("rejects actions whose code doesn't match the attached table", async () => {
    const srv = await server();
    const c = client(srv.port);
    const made = await c.call("create", { name: "A" });
    const r = await c.call("addBot", { code: "ZZZZ" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Out of sync/);
    expect((await c.call("addBot", { code: made.data.code })).ok).toBe(true);
  });

  it("tells resume failures apart", async () => {
    const srv = await server();
    const c = client(srv.port);
    const made = await c.call("create", { name: "A" });
    expect((await client(srv.port).call("resume", { code: "ZZZZ", token: "x" })).error).toMatch(/may have closed/);
    expect((await client(srv.port).call("resume", { code: made.data.code, token: "x" })).error).toMatch(/no longer valid/);
  });

  it("stops bots and saving after close()", async () => {
    let saves = 0;
    const store = new SharedStore();
    const orig = store.save.bind(store);
    store.save = async (s) => {
      saves++;
      return orig(s);
    };
    const srv = await server(store);
    const c = client(srv.port);
    await c.call("create", { name: "A", bots: 3 });
    await c.call("autoplay", { on: true });
    await c.until((v) => v.status === "playing");
    await srv.close();
    const after = saves;
    await wait(300);
    expect(saves).toBe(after);
  });

  it("sweeps abandoned old tables", async () => {
    const srv = await server();
    const c = client(srv.port);
    const made = await c.call("create", { name: "A" });
    const t = srv.tables.get(made.data.code)!;
    srv.sweep(Date.now());
    expect(srv.tables.has(made.data.code)).toBe(true); // connected: kept
    c.socket.disconnect();
    for (let i = 0; i < 50 && t.hasConnectedHumans(); i++) await wait(20);
    srv.sweep(Date.now() + 60_000);
    expect(srv.tables.has(made.data.code)).toBe(true); // empty lobby, but only briefly
    srv.sweep(Date.now() + 16 * 60_000);
    expect(srv.tables.has(made.data.code)).toBe(false); // empty for 15+ minutes: gone
  });
});

// Runs only when a database is available, e.g.
// TEST_DATABASE_URL=postgres://marriage:marriage@localhost:5432/marriage npm test
describe.skipIf(!process.env.TEST_DATABASE_URL)("postgres store", () => {
  it("saves and loads table state", async () => {
    const store = new PgStore(process.env.TEST_DATABASE_URL!);
    await store.init();
    const srv1 = await server(store);
    const c = client(srv1.port);
    const made = await c.call("create", { name: "Pg" });
    await srv1.close();
    // close() ends the server's pool, so read back with a fresh store.
    const reader = new PgStore(process.env.TEST_DATABASE_URL!);
    const rows = await reader.loadActive();
    expect(rows.some((s) => s.code === made.data.code)).toBe(true);
    await reader.remove(made.data.code);
    await reader.close();
  });
});
