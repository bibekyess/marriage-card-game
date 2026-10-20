import express from "express";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server, Socket } from "socket.io";
import { Ack, Route } from "../shared/protocol";
import { basicAuthOk, LiveTable, renderAdmin } from "./admin";
import type { Store } from "./db";
import { DAY_MS, EventLog } from "./events";
import { GameError, Table } from "./table";

export interface ServerOptions {
  port: number;
  store: Store;
  /** Multiplies bot/timer delays; tests use 0 for instant bots. */
  delayScale?: number;
  clientDir?: string | null;
  /** Enables /admin (HTTP Basic, any username). Defaults to ADMIN_TOKEN; unset or under 16 characters means no admin page. */
  adminToken?: string;
  /** Base URL of Umami (e.g. http://umami:3000); enables the /stats proxy. Defaults to UMAMI_URL. */
  umamiUrl?: string;
  /** Umami website id; when set the tracker script is injected into index.html. Defaults to UMAMI_WEBSITE_ID. */
  umamiWebsiteId?: string;
  /** Link shown on the admin page. Defaults to UMAMI_DASHBOARD_URL. */
  umamiDashboardUrl?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const httpUrl = (x: string | undefined) => (x && /^https?:\/\//i.test(x.trim()) ? x.trim() : undefined);

const MIN_ADMIN_TOKEN = 16;
/** Pause before answering a wrong admin password, so guessing is slow without locking anyone out. */
const WRONG_PASSWORD_DELAY_MS = 500;

/** True when this address has used up `max` requests in the last `windowMs`; otherwise records one. */
function limited(hits: Map<string, number[]>, key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((x) => now - x < windowMs);
  if (recent.length >= max) return true;
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.clear();
  return false;
}

export async function startServer(opts: ServerOptions) {
  const { store } = opts;
  const delayScale = opts.delayScale ?? 1;
  const configuredToken = opts.adminToken ?? process.env.ADMIN_TOKEN ?? "";
  const adminToken = configuredToken.length >= MIN_ADMIN_TOKEN ? configuredToken : "";
  if (configuredToken && !adminToken)
    console.error(`ADMIN_TOKEN is shorter than ${MIN_ADMIN_TOKEN} characters, so /admin stays off. Try: openssl rand -hex 32`);
  const umamiUrl = httpUrl(opts.umamiUrl ?? process.env.UMAMI_URL)?.replace(/\/+$/, "");
  const websiteId = (opts.umamiWebsiteId ?? process.env.UMAMI_WEBSITE_ID ?? "").trim();
  const events = new EventLog(store, adminToken);
  const tables = new Map<string, Table>();
  const timers = new Map<string, NodeJS.Timeout>();
  let closed = false;

  const app = express();
  const http = createServer(app);
  const io = new Server(http, { pingInterval: 10_000, pingTimeout: 8_000 });

  app.disable("x-powered-by");
  // Behind a reverse proxy set TRUST_PROXY=1 so rate limits use the client's real address.
  const trust = !!process.env.TRUST_PROXY && process.env.TRUST_PROXY !== "0" && process.env.TRUST_PROXY !== "false";
  // One trusted hop: req.ip becomes the last X-Forwarded-For entry, same as the socket code below.
  if (trust) app.set("trust proxy", 1);
  app.get("/api/health", (_req, res) => res.json({ ok: true, tables: tables.size }));
  // Status of a table you hold a seat at ("Your tables" on the home screen). Requires your seat
  // token, so table codes can't be scanned for names; rate-limited per address.
  const statusHits = new Map<string, number[]>();
  app.post("/api/tables/:code", express.json({ limit: "2kb" }), (req, res) => {
    if (limited(statusHits, req.ip ?? "?", 60)) return res.status(429).json({ error: "Too many requests" });
    res.set("Cache-Control", "no-store");
    const code = String(req.params.code).toUpperCase();
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const t = /^[A-Z]{4}$/.test(code) ? tables.get(code) : undefined;
    if (!t || !token || !t.byToken(token)) return res.json({ exists: false });
    res.json({
      exists: true,
      status: t.s.status,
      round: t.s.round,
      rounds: t.s.settings.rounds,
      players: t.s.seats.filter((x) => !x.left).map((x) => x.name),
    });
  });

  // ---------- admin ----------

  // Without a token the page doesn't exist at all: /admin and anything below it is a plain 404.
  if (adminToken) {
    const failedAuth = new Map<string, number[]>();
    app.get("/admin", async (req, res) => {
      res.set("Cache-Control", "no-store");
      const ip = req.ip ?? "?";
      const auth = req.headers.authorization;
      if (!auth || !basicAuthOk(auth, adminToken)) {
        res.set("WWW-Authenticate", 'Basic realm="Marriage admin", charset="UTF-8"');
        if (auth) await new Promise((r) => setTimeout(r, WRONG_PASSWORD_DELAY_MS * delayScale));
        // Only a wrong password counts (a first visit has no header yet), and only wrong guesses are
        // refused once an address has made too many: the right token always gets in.
        if (auth && limited(failedAuth, ip, 10, 10 * 60_000)) return res.status(429).type("text").send("Too many attempts. Try again later.");
        return res.status(401).type("text").send("Authentication required.");
      }
      failedAuth.delete(ip);
      try {
        const live: LiveTable[] = [...tables.values()].map((t) => ({
          code: t.s.code,
          status: t.s.status,
          round: t.s.round,
          rounds: t.s.settings.rounds,
          players: t.s.seats.filter((x) => !x.left).map((x) => ({ name: x.name, bot: x.isBot, away: !x.isBot && !t.connected.has(x.id) })),
        }));
        const [stats, recent] = await Promise.all([store.stats(), store.recentEvents(100)]);
        res.type("html").send(renderAdmin({ live, stats, events: recent, umamiUrl: httpUrl(opts.umamiDashboardUrl ?? process.env.UMAMI_DASHBOARD_URL) }));
      } catch (e) {
        console.error("admin page failed", (e as Error)?.message ?? e);
        res.status(500).type("text").send("Couldn't load stats.");
      }
    });
  }

  app.use("/admin", (_req, res) => res.status(404).type("text").send("Not found"));

  // ---------- Umami (same-origin proxy, so ad blockers and CORS don't get in the way) ----------

  if (umamiUrl) {
    const sendHits = new Map<string, number[]>();
    let script: { body: string; at: number } | null = null;
    // One shared refresh at a time, and after a failure no new attempt for a minute.
    let refreshing: Promise<void> | null = null;
    let retryAt = 0;
    const refreshScript = () =>
      (refreshing ??= (async () => {
        try {
          const r = await fetch(`${umamiUrl}/script.js`, { signal: AbortSignal.timeout(5000) });
          if (!r.ok) throw new Error(`status ${r.status}`);
          script = { body: await r.text(), at: Date.now() };
        } catch {
          retryAt = Date.now() + 60_000;
        } finally {
          refreshing = null;
        }
      })());
    app.get("/stats/s.js", async (_req, res) => {
      // Keep serving the last good copy if Umami is briefly down.
      if ((!script || Date.now() - script.at > 10 * 60_000) && Date.now() >= retryAt) await refreshScript();
      if (!script) return res.status(502).end();
      res.type("application/javascript").set("Cache-Control", "public, max-age=600").send(script.body);
    });
    // The tracker posts to `${data-host-url}/api/send`.
    app.post("/stats/api/send", express.raw({ type: () => true, limit: "16kb" }), async (req, res) => {
      if (limited(sendHits, req.ip ?? "?", 120)) return res.status(429).end();
      const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": req.ip ?? "" };
      for (const h of ["user-agent", "accept-language", "x-umami-cache", "x-umami-website-id", "x-umami-hostname"]) {
        const v = req.headers[h];
        if (typeof v === "string") headers[h] = v;
      }
      try {
        const r = await fetch(`${umamiUrl}/api/send`, {
          method: "POST",
          headers,
          body: Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : "{}",
          signal: AbortSignal.timeout(5000),
        });
        res.status(r.status).type(r.headers.get("content-type") ?? "application/json").send(Buffer.from(await r.arrayBuffer()));
      } catch {
        // Stats are optional: a dead Umami must never show up as a game problem.
        res.status(502).end();
      }
    });
  }

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
    // With a website id, serve index.html with the Umami tracker added (read once at startup).
    let indexHtml: string | null = null;
    if (umamiUrl && UUID.test(websiteId)) {
      try {
        const raw = readFileSync(path.join(clientDir, "index.html"), "utf8");
        const tag = `<script defer src="/stats/s.js" data-website-id="${websiteId}" data-host-url="/stats" data-exclude-search="true"></script>`;
        if (raw.includes("</head>")) indexHtml = raw.replace("</head>", `${tag}</head>`);
      } catch (e) {
        console.error("couldn't prepare index.html for Umami", (e as Error).message);
      }
    } else if (websiteId) console.error("UMAMI_WEBSITE_ID needs UMAMI_URL and must be a UUID; tracker not added");
    app.get("*", (req, res) => {
      // Only the real client routes count as visits (same shapes as lib/router.ts), not scanner junk.
      if (req.path === "/" || /^\/t\/[A-Za-z]{4}\/?$/.test(req.path)) events.visit(req.ip);
      res.setHeader("Cache-Control", "no-cache");
      if (indexHtml) res.type("html").send(indexHtml);
      else res.sendFile(path.join(clientDir, "index.html"));
    });
  }

  // ---------- limits ----------

  const MAX_TABLES = 5000;
  const CREATES_PER_IP = 20; // per CREATE_WINDOW_MS
  const CREATE_WINDOW_MS = 10 * 60_000;
  const CREATE_GAP_MS = 1000;
  const JOIN_GAP_MS = 300;
  const SWEEP_MS = 5 * 60_000;
  /** How long a table may sit with nobody (human) connected before it is removed. */
  const EMPTY_LOBBY_MS = 15 * 60_000;
  const EMPTY_MATCH_END_MS = 2 * 3600_000;
  const EMPTY_OTHER_MS = 24 * 3600_000;
  /** Bots and timers pause once a table has had no humans for this long. */
  const PAUSE_EMPTY_MS = 2 * 60_000;
  const createsByIp = new Map<string, number[]>();
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
    // Nobody's here: don't let bots play on (and keep the table alive) forever.
    if (!t.hasConnectedHumans() && Date.now() - (t.emptySince ?? Date.now()) > PAUSE_EMPTY_MS) return;
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

  /** Feed table milestones (match started/ended, round won, bot added) into the event log. */
  function observe(t: Table) {
    t.onEvent = (type, f) => events.track(type, { code: t.s.code, ...f });
  }
  const nameOf = (t: Table, id: string) => t.s.seats.find((x) => x.id === id)?.name ?? t.s.spectators.find((x) => x.id === id)?.name;
  // Spectators join and leave too; mark them so they aren't mistaken for seated players.
  const watching = (t: Table, id: string) => (t.s.spectators.some((x) => x.id === id) ? { watching: true } : undefined);

  function removeTable(code: string) {
    clearTimeout(timers.get(code));
    timers.delete(code);
    failures.delete(code);
    gaveUp.delete(code);
    tables.delete(code);
    io.in(code).socketsLeave(code);
    const slot = saving.get(code);
    if (!slot?.inflight) saving.delete(code); // otherwise runSave's tail drops it
    const p: Promise<unknown> = Promise.resolve(slot?.inflight)
      .then(() => store.remove(code))
      .catch((e) => console.error("remove failed", code, (e as Error)?.message ?? e))
      .then(() => background.delete(p));
    background.add(p);
  }

  const VISIT_RETENTION_MS = 90 * DAY_MS;
  let lastPrune = 0;

  function sweep(now = Date.now()) {
    if (closed) return;
    if (now - lastPrune > DAY_MS) {
      lastPrune = now;
      const p: Promise<unknown> = store
        .pruneVisits(now - VISIT_RETENTION_MS)
        .catch((e) => console.error("visit cleanup failed", (e as Error)?.message ?? e))
        .then(() => background.delete(p));
      background.add(p);
    }
    for (const [code, t] of [...tables]) {
      try {
        if (t.maybeTransferHost(now)) changed(t);
        const limit = t.s.status === "lobby" ? EMPTY_LOBBY_MS : t.s.status === "matchEnd" ? EMPTY_MATCH_END_MS : EMPTY_OTHER_MS;
        if (!t.hasConnectedHumans() && now - (t.emptySince ?? t.s.updatedAt) > limit) {
          events.track("table.removed", { code, data: { status: t.s.status, round: t.s.round } });
          removeTable(code);
        }
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
    const fwd = socket.handshake.headers["x-forwarded-for"];
    // Use the hop our own proxy appended (the last one); earlier entries can be forged by the client.
    const ip = (trust && typeof fwd === "string" && fwd.split(",").at(-1)!.trim()) || socket.handshake.address || "?";
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
      const recent = (createsByIp.get(ip) ?? []).filter((x) => now - x < CREATE_WINDOW_MS);
      if (recent.length >= CREATES_PER_IP) bad("You've opened a lot of tables — try again in a few minutes.");
      if (tables.size >= MAX_TABLES) bad("The server is full, try again later");
      const name = optStr(p.name, "name");
      if (p.settings !== undefined && p.settings !== null && !isObj(p.settings)) bad("Invalid settings.");
      const bots = Math.max(0, Math.min(4, Math.trunc(num(p.bots)) || 0));
      const code = newCode();
      socket.data.lastCreate = now;
      recent.push(now);
      createsByIp.set(ip, recent);
      const { table, seat } = Table.create(code, name ?? "", (p.settings as any) ?? {}, bots, p.look);
      observe(table);
      events.track("table.created", { code, name: seat.name, ip, data: bots ? { bots } : undefined });
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
        if (!t.connected.has(known)) events.track("player.reconnected", { code, name: nameOf(t, known), ip });
        t.reclaim(known);
        attach(socket, t, known);
        reply({ ok: true, data: { code, playerId: known, token } });
        return changed(t);
      }
      if (!name || !name.trim()) return bad("Enter your name first.");
      const { id, token: fresh } = t.join(name, p.look);
      events.track("player.joined", { code, name: nameOf(t, id), ip, data: watching(t, id) });
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
      if (!t.connected.has(id)) events.track("player.reconnected", { code: t.s.code, name: nameOf(t, id), ip });
      t.reclaim(id);
      attach(socket, t, id);
      reply({ ok: true, data: { code: t.s.code, playerId: id, token } });
      changed(t);
    });

    on("leave", (_p, reply) => {
      const t = tables.get(socket.data.code);
      const id = socket.data.playerId as string | undefined;
      const name = t && id ? nameOf(t, id) : undefined;
      const data = t && id ? watching(t, id) : undefined;
      const { removed } = t && id ? t.leave(id) : { removed: false };
      if (removed && t) events.track("player.left", { code: t.s.code, name, ip, data });
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
      openTunnels: (t, id) => t.openTunnels(id),
      declare: (t, id, p) =>
        t.declare(
          id,
          optStr(p.discard, "card", 20),
          p.groups === undefined ? undefined : Array.isArray(p.groups) && p.groups.length <= 21 ? p.groups.map((g) => strArr(g, "groups", 21)) : bad("Invalid groups."),
        ),
      arrange: (t, id, p) => t.arrange(id, strArr(p.order, "order")),
      start: (t, id) => t.start(id),
      addBot: (t, id) => t.addBot(id),
      removeSeat: (t, id, p) => t.removeSeat(id, reqStr(p.id, "id", 40)),
      settings: (t, id, p) => {
        if (!isObj(p.settings)) bad("Invalid settings.");
        t.updateSettings(id, p.settings as any);
      },
      turnTimer: (t, id, p) => {
        if (typeof p.seconds !== "number") bad("Invalid timer.");
        t.setTurnTimer(id, p.seconds);
      },
      autoplay: (t, id, p) => {
        if (typeof p.on !== "boolean") bad("Invalid autoplay value.");
        t.setAutoplay(id, optStr(p.id, "id", 40) ?? id, p.on);
      },
      look: (t, id, p) => t.setLook(id, p.look === null ? null : reqStr(p.look, "look", 10)),
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
      observe(t);
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
      await events.flush();
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
