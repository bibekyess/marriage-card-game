import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server, Socket } from "socket.io";
import { Ack, Route } from "../shared/protocol";
import type { Store } from "./db";
import { GameError, Table } from "./table";

export interface ServerOptions {
  port: number;
  store: Store;
  /** Multiplies bot/timer delays; tests use 0 for instant bots. */
  delayScale?: number;
  clientDir?: string | null;
}

export async function startServer(opts: ServerOptions) {
  const { store } = opts;
  const delayScale = opts.delayScale ?? 1;
  const tables = new Map<string, Table>();
  const timers = new Map<string, NodeJS.Timeout>();
  let closed = false;

  const app = express();
  const http = createServer(app);
  const io = new Server(http, { pingInterval: 10_000, pingTimeout: 8_000 });

  app.disable("x-powered-by");
  app.get("/api/health", (_req, res) => res.json({ ok: true, tables: tables.size }));
  app.use("/api", (_req, res) => res.status(404).json({ ok: false, error: "Not found" }));

  // Serve the built client (production). In development Vite serves it.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDir =
    opts.clientDir === undefined
      ? [path.join(here, "client"), path.join(here, "../../dist/client")].find((d) => existsSync(d))
      : opts.clientDir;
  if (clientDir) {
    // Vite emits content-hashed files under /assets, so they can be cached forever.
    app.use("/assets", express.static(path.join(clientDir, "assets"), { maxAge: "1y", immutable: true, index: false }));
    app.use("/assets", (_req, res) => res.status(404).end());
    app.use(express.static(clientDir, { maxAge: "1h", index: false }));
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(clientDir, "index.html"));
    });
  }

  // ---------- limits ----------

  const MAX_TABLES = 5000;
  const MAX_CREATED_PER_SOCKET = 5;
  const CREATE_GAP_MS = 3000;
  const JOIN_GAP_MS = 1000;
  const SWEEP_MS = 5 * 60_000;
  const IDLE_LOBBY_MS = 6 * 3600_000;
  const IDLE_OTHER_MS = 24 * 3600_000;
  const RETRY_MS = 5000;
  const MAX_FAILURES = 3;
  const SAVE_LOG_GAP_MS = 30_000;

  // ---------- table lifecycle ----------

  const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
  function newCode() {
    for (let n = 0; n < 200; n++) {
      let c = "";
      for (let i = 0; i < 4; i++) c += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
      if (!tables.has(c)) return c;
    }
    throw new GameError("The server is full, try again later");
  }

  // Saves are coalesced per table: at most one in flight, and if more changes arrive meanwhile
  // we save the latest state once when it finishes.
  interface SaveSlot {
    inflight: Promise<void> | null;
    dirty: boolean;
    lastLog: number;
  }
  const saving = new Map<string, SaveSlot>();
  const background = new Set<Promise<unknown>>();

  function runSave(t: Table, slot: SaveSlot) {
    slot.dirty = false;
    const code = t.s.code;
    slot.inflight = Promise.resolve()
      .then(() => store.save(t.s))
      .catch((e) => {
        const now = Date.now();
        if (now - slot.lastLog > SAVE_LOG_GAP_MS) {
          slot.lastLog = now;
          console.error("save failed", code, (e as Error)?.message ?? e);
        }
      })
      .then(() => {
        slot.inflight = null;
        if (tables.get(code) !== t) saving.delete(code);
        else if (slot.dirty) runSave(t, slot);
      });
  }

  function persist(t: Table) {
    if (closed) return;
    t.s.updatedAt = Date.now();
    let slot = saving.get(t.s.code);
    if (!slot) saving.set(t.s.code, (slot = { inflight: null, dirty: false, lastLog: 0 }));
    if (slot.inflight) slot.dirty = true;
    else runSave(t, slot);
  }

  function broadcast(t: Table) {
    if (closed) return;
    for (const sock of io.sockets.adapter.rooms.get(t.s.code) ?? []) {
      const s = io.sockets.sockets.get(sock);
      if (s?.data.playerId) s.emit("state", t.view(s.data.playerId));
    }
  }

  /** After any change: save, push views, and schedule bots / timers. */
  function changed(t: Table) {
    persist(t);
    broadcast(t);
    schedule(t);
  }

  const failures = new Map<string, number>();
  const gaveUp = new Set<string>();

  function schedule(t: Table, backoff = false) {
    const code = t.s.code;
    clearTimeout(timers.get(code));
    timers.delete(code);
    if (closed || gaveUp.has(code)) return;
    let step;
    try {
      step = t.nextStep();
    } catch (e) {
      console.error("nextStep failed", code, e);
      return;
    }
    if (!step) return;
    const kind = step.kind;
    const delay = backoff ? RETRY_MS : Math.max(0, (step.at - Date.now()) * (kind === "bot" ? delayScale : 1));
    timers.set(
      code,
      setTimeout(() => {
        timers.delete(code);
        if (closed || tables.get(code) !== t) return;
        try {
          try {
            t.autoStep(kind);
          } catch (e) {
            console.error("auto step failed", code, e);
            // Never leave the table stuck: fall back to the simplest legal move.
            t.autoStep("timeout");
          }
          failures.delete(code);
          changed(t);
        } catch (e) {
          const n = (failures.get(code) ?? 0) + 1;
          failures.set(code, n);
          if (n === 1) console.error("auto step fallback failed", code, e);
          if (n >= MAX_FAILURES) {
            gaveUp.add(code);
            console.error(`giving up on automatic play for table ${code} until a player acts`);
          } else schedule(t, true);
        }
      }, delay),
    );
  }

  function removeTable(code: string) {
    clearTimeout(timers.get(code));
    timers.delete(code);
    failures.delete(code);
    gaveUp.delete(code);
    tables.delete(code);
    const slot = saving.get(code);
    if (!slot?.inflight) saving.delete(code); // otherwise runSave's tail drops it
    const p: Promise<unknown> = Promise.resolve(slot?.inflight)
      .then(() => store.remove(code))
      .catch((e) => console.error("remove failed", code, (e as Error)?.message ?? e))
      .then(() => background.delete(p));
    background.add(p);
  }

  function sweep(now = Date.now()) {
    if (closed) return;
    for (const [code, t] of [...tables]) {
      try {
        if (t.maybeTransferHost(now)) changed(t);
        const limit = t.s.status === "lobby" || t.s.status === "matchEnd" ? IDLE_LOBBY_MS : IDLE_OTHER_MS;
        if (!t.hasConnectedHumans() && now - t.s.updatedAt > limit) removeTable(code);
      } catch (e) {
        console.error("sweep failed", code, e);
      }
    }
  }

  // ---------- sockets ----------

  const bad = (msg: string): never => {
    throw new GameError(msg);
  };
  const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
  /** Optional string field; returns undefined when absent. */
  function optStr(x: unknown, what: string, max = 200): string | undefined {
    if (x === undefined || x === null) return undefined;
    if (typeof x !== "string" || x.length > max) return bad(`Invalid ${what}.`);
    return x;
  }
  function reqStr(x: unknown, what: string, max = 200): string {
    return optStr(x, what, max) ?? bad(`Missing ${what}.`);
  }
  function strArr(x: unknown, what: string, max = 30): string[] {
    if (!Array.isArray(x) || x.length > max || x.some((v) => typeof v !== "string" || v.length > 20)) return bad(`Invalid ${what}.`);
    return x as string[];
  }
  /** Only primitives are coerced; objects like {valueOf: 1} would make Number() throw. */
  const num = (x: unknown) => (typeof x === "number" || typeof x === "string" ? Number(x) : 0);

  function respond(ack: unknown, res: Ack) {
    if (typeof ack !== "function") return;
    try {
      ack(res);
    } catch (e) {
      console.error("ack failed", e);
    }
  }

  /** Join the room and mark online. Does not broadcast: callers respond first, then call changed(). */
  function attach(socket: Socket, t: Table, playerId: string) {
    const prevCode = socket.data.code as string | undefined;
    const prevId = socket.data.playerId as string | undefined;
    if (prevCode && prevId && (prevCode !== t.s.code || prevId !== playerId)) leaveRoom(socket);
    socket.data.code = t.s.code;
    socket.data.playerId = playerId;
    socket.join(t.s.code);
    t.setConnected(playerId, true);
  }

  function leaveRoom(socket: Socket) {
    const code = socket.data.code as string | undefined;
    const pid = socket.data.playerId as string | undefined;
    socket.data.code = undefined;
    socket.data.playerId = undefined;
    if (!code || !pid) return;
    socket.leave(code);
    const t = tables.get(code);
    if (!t) return;
    // Someone may have the same seat open in another tab.
    const stillHere = [...(io.sockets.adapter.rooms.get(code) ?? [])].some(
      (sid) => io.sockets.sockets.get(sid)?.data.playerId === pid,
    );
    if (!stillHere) {
      t.setConnected(pid, false);
      changed(t);
    }
  }

  type Handler = (t: Table, playerId: string, p: Record<string, any>) => unknown;

  io.on("connection", (socket) => {
    socket.data.created = 0;
    socket.data.lastCreate = 0;
    socket.data.lastJoin = 0;

    /** The one place events are registered: nothing a client sends can throw out of here. */
    function on(name: string, fn: (p: Record<string, any>, reply: (res: Ack) => void) => void) {
      socket.on(name, (...args: unknown[]) => {
        let payload: unknown = args[0];
        let ack: unknown = args[1];
        if (typeof payload === "function" && ack === undefined) {
          ack = payload;
          payload = undefined;
        }
        let answered = false;
        const reply = (res: Ack) => {
          if (answered) return;
          answered = true;
          respond(ack, res);
        };
        try {
          fn(isObj(payload) ? payload : {}, reply);
        } catch (e) {
          if (e instanceof GameError) reply({ ok: false, error: e.message });
          else {
            console.error("handler error", name, e);
            reply({ ok: false, error: "Something went wrong." });
          }
        }
      });
    }

    on("create", (p, reply) => {
      const now = Date.now();
      if (now - socket.data.lastCreate < CREATE_GAP_MS) bad("You're doing that too fast. Wait a moment.");
      if (socket.data.created >= MAX_CREATED_PER_SOCKET) bad("You've opened too many tables. Reload the page to continue.");
      if (tables.size >= MAX_TABLES) bad("The server is full, try again later");
      const name = optStr(p.name, "name");
      if (p.settings !== undefined && p.settings !== null && !isObj(p.settings)) bad("Invalid settings.");
      const bots = Math.max(0, Math.min(4, Math.trunc(num(p.bots)) || 0));
      const code = newCode();
      socket.data.lastCreate = now;
      socket.data.created++;
      const { table, seat } = Table.create(code, name ?? "", (p.settings as any) ?? {}, bots);
      if (bots) table.start(seat.id);
      tables.set(code, table);
      attach(socket, table, seat.id);
      reply({ ok: true, data: { code, playerId: seat.id, token: seat.token } });
      changed(table);
    });

    on("join", (p, reply) => {
      const now = Date.now();
      if (now - socket.data.lastJoin < JOIN_GAP_MS) bad("You're doing that too fast. Wait a moment.");
      socket.data.lastJoin = now;
      const code = (optStr(p.code, "code", 20) ?? "").trim().toUpperCase();
      const token = optStr(p.token, "token");
      const name = optStr(p.name, "name");
      const t = tables.get(code);
      if (!t) return bad(`No table with code ${code || "—"}. Check the code and try again.`);
      const known = token ? t.byToken(token) : null;
      if (known) {
        attach(socket, t, known);
        reply({ ok: true, data: { code, playerId: known, token } });
        return changed(t);
      }
      if (!name || !name.trim()) return bad("Enter your name first.");
      const { id, token: fresh } = t.join(name);
      attach(socket, t, id);
      reply({ ok: true, data: { code, playerId: id, token: fresh } });
      changed(t);
    });

    on("resume", (p, reply) => {
      const code = reqStr(p.code, "code", 20).trim().toUpperCase();
      const token = reqStr(p.token, "token");
      const t = tables.get(code);
      if (!t) return bad("No table with that code — it may have closed.");
      const id = t.byToken(token);
      if (!id) return bad("Your seat at this table is no longer valid.");
      attach(socket, t, id);
      reply({ ok: true, data: { code: t.s.code, playerId: id, token } });
      changed(t);
    });

    on("leave", (_p, reply) => {
      const t = tables.get(socket.data.code);
      const id = socket.data.playerId as string | undefined;
      const { removed } = t && id ? t.leave(id) : { removed: false };
      reply({ ok: true, data: { removed } });
      leaveRoom(socket);
      if (removed && t) changed(t);
    });

    // Navigating home: stop receiving updates but keep the seat.
    on("detach", (_p, reply) => {
      leaveRoom(socket);
      reply({ ok: true });
    });

    const actions: Record<string, Handler> = {
      draw: (t, id, p) => {
        const from = optStr(p.from, "pile", 10);
        t.draw(id, from === "discard" ? "discard" : "stock");
      },
      discard: (t, id, p) => t.discard(id, reqStr(p.card, "card", 20)),
      show: (t, id, p) => {
        const route = optStr(p.route, "route", 10);
        t.show(id, (route === "dublee" ? "dublee" : "pure") as Route, p.cards === undefined ? [] : strArr(p.cards, "cards"));
      },
      declare: (t, id, p) => t.declare(id, optStr(p.discard, "card", 20)),
      arrange: (t, id, p) => t.arrange(id, strArr(p.order, "order")),
      start: (t, id) => t.start(id),
      addBot: (t, id) => t.addBot(id),
      removeSeat: (t, id, p) => t.removeSeat(id, reqStr(p.id, "id", 40)),
      settings: (t, id, p) => {
        if (!isObj(p.settings)) bad("Invalid settings.");
        t.updateSettings(id, p.settings as any);
      },
      autoplay: (t, id, p) => {
        if (typeof p.on !== "boolean") bad("Invalid autoplay value.");
        t.setAutoplay(id, optStr(p.id, "id", 40) ?? id, p.on);
      },
      endMatch: (t, id) => t.endMatch(id),
      newMatch: (t, id) => t.newMatch(id),
    };

    for (const [name, fn] of Object.entries(actions)) {
      on(name, (p, reply) => {
        const t = tables.get(socket.data.code);
        const id = socket.data.playerId as string | undefined;
        if (!t || !id) return bad("You're not at a table.");
        const claimed = optStr(p.code, "code", 20);
        if (claimed !== undefined && claimed.trim().toUpperCase() !== t.s.code) bad("Out of sync with the table — reconnecting…");
        fn(t, id, p);
        // A player acted: automatic play may try again.
        failures.delete(t.s.code);
        gaveUp.delete(t.s.code);
        reply({ ok: true });
        // Arranging your own hand only matters to you.
        if (name === "arrange") persist(t);
        else changed(t);
      });
    }

    socket.on("disconnect", () => {
      try {
        leaveRoom(socket);
      } catch (e) {
        console.error("disconnect failed", e);
      }
    });
  });

  await store.init();
  for (const s of await store.loadActive()) {
    try {
      const t = new Table(s);
      // Nobody is connected right after a restart; give people time to come back.
      for (const seat of s.seats) if (!seat.isBot) t.setConnected(seat.id, false);
      t.extendDeadline(60_000);
      tables.set(s.code, t);
      schedule(t);
    } catch (e) {
      console.error("couldn't restore table", s?.code, e);
    }
  }
  await new Promise<void>((r) => http.listen(opts.port, r));
  const address = http.address();
  const port = typeof address === "object" && address ? address.port : opts.port;

  const sweeper = setInterval(() => sweep(), SWEEP_MS);
  sweeper.unref();

  let closing: Promise<void> | null = null;
  /** Stop accepting connections, stop all bots/timers, and flush pending saves. */
  function close() {
    return (closing ??= (async () => {
      closed = true;
      clearInterval(sweeper);
      io.close();
      await new Promise((r) => http.close(r));
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      for (;;) {
        const pending = [...saving.values()].map((x) => x.inflight).filter((x): x is Promise<void> => !!x);
        pending.push(...(background as Set<Promise<void>>));
        if (!pending.length) break;
        await Promise.all(pending);
      }
      await store.close();
    })());
  }

  return {
    port,
    tables,
    /** Stop accepting connections and flush pending saves. */
    sweep,
    close,
  };
}
