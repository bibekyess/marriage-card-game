import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server, Socket } from "socket.io";
import { Ack, Route } from "../shared/protocol";
import { Settings } from "../shared/settings";
import { MemoryStore, PgStore, Store } from "./db";
import { GameError, Table } from "./table";

const PORT = Number(process.env.PORT || 3000);
const store: Store = process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new MemoryStore();

const tables = new Map<string, Table>();
const timers = new Map<string, NodeJS.Timeout>();

const app = express();
const http = createServer(app);
const io = new Server(http, { pingInterval: 10_000, pingTimeout: 8_000 });

app.get("/api/health", (_req, res) => res.json({ ok: true, tables: tables.size }));

// Serve the built client (production). In development Vite serves it.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = [path.join(here, "client"), path.join(here, "../../dist/client")].find((d) => existsSync(d));
if (clientDir) {
  app.use(express.static(clientDir, { maxAge: "1h", index: false }));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
}

// ---------- table lifecycle ----------

const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
function newCode() {
  for (;;) {
    let c = "";
    for (let i = 0; i < 4; i++) c += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    if (!tables.has(c)) return c;
  }
}

const saving = new Map<string, Promise<void>>();
function persist(t: Table) {
  t.s.updatedAt = Date.now();
  const prev = saving.get(t.s.code) ?? Promise.resolve();
  const next = prev.then(() => store.save(t.s)).catch((e) => console.error("save failed", t.s.code, e.message));
  saving.set(t.s.code, next);
}

function broadcast(t: Table) {
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

function schedule(t: Table) {
  clearTimeout(timers.get(t.s.code));
  const step = t.nextStep();
  if (!step) return;
  timers.set(
    t.s.code,
    setTimeout(() => {
      try {
        t.autoStep(step.kind);
      } catch (e) {
        console.error("auto step failed", t.s.code, e);
        // Never leave the table stuck: fall back to the simplest legal move.
        try {
          t.autoStep("timeout");
        } catch {}
      }
      changed(t);
    }, Math.max(0, step.at - Date.now())),
  );
}

// ---------- sockets ----------

type Handler = (t: Table, playerId: string, payload: any) => unknown;

function respond(ack: unknown, res: Ack) {
  if (typeof ack === "function") ack(res);
}

function attach(socket: Socket, t: Table, playerId: string) {
  const prev = socket.data.code as string | undefined;
  if (prev && prev !== t.s.code) leaveRoom(socket);
  socket.data.code = t.s.code;
  socket.data.playerId = playerId;
  socket.join(t.s.code);
  t.setConnected(playerId, true);
  changed(t);
}

function leaveRoom(socket: Socket) {
  const code = socket.data.code as string | undefined;
  const pid = socket.data.playerId as string | undefined;
  if (!code || !pid) return;
  socket.leave(code);
  socket.data.code = undefined;
  socket.data.playerId = undefined;
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

io.on("connection", (socket) => {
  socket.on("create", (p: { name: string; settings?: Partial<Settings>; bots?: number }, ack) => {
    const bots = Math.max(0, Math.min(4, Number(p?.bots) || 0));
    const { table, seat } = Table.create(newCode(), p?.name, p?.settings ?? {}, bots);
    tables.set(table.s.code, table);
    if (bots) table.start(seat.id);
    attach(socket, table, seat.id);
    respond(ack, { ok: true, data: { code: table.s.code, playerId: seat.id, token: seat.token } });
  });

  socket.on("join", (p: { code: string; name: string; token?: string }, ack) => {
    const code = String(p?.code || "").trim().toUpperCase();
    const t = tables.get(code);
    if (!t) return respond(ack, { ok: false, error: `No table with code ${code || "—"}. Check the code and try again.` });
    const known = p?.token ? t.byToken(p.token) : null;
    if (known) {
      attach(socket, t, known);
      return respond(ack, { ok: true, data: { code, playerId: known, token: p.token } });
    }
    if (!p?.name) return respond(ack, { ok: false, error: "Enter your name first." });
    const { id, token } = t.join(p.name);
    attach(socket, t, id);
    respond(ack, { ok: true, data: { code, playerId: id, token } });
  });

  socket.on("resume", (p: { code: string; token: string }, ack) => {
    const t = tables.get(String(p?.code || "").toUpperCase());
    const id = t && p?.token ? t.byToken(p.token) : null;
    if (!t || !id) return respond(ack, { ok: false, error: "That table has closed." });
    attach(socket, t, id);
    respond(ack, { ok: true, data: { code: t.s.code, playerId: id, token: p.token } });
  });

  socket.on("leave", (_p, ack) => {
    const t = tables.get(socket.data.code);
    const id = socket.data.playerId;
    if (t && id && t.s.status !== "playing" && id !== t.s.hostId) {
      try {
        t.removeSeat(id, id);
      } catch {}
    }
    leaveRoom(socket);
    respond(ack, { ok: true });
  });

  const actions: Record<string, Handler> = {
    draw: (t, id, p) => t.draw(id, p?.from === "discard" ? "discard" : "stock"),
    discard: (t, id, p) => t.discard(id, p?.card),
    show: (t, id, p) => t.show(id, (p?.route === "dublee" ? "dublee" : "pure") as Route, p?.cards),
    declare: (t, id, p) => t.declare(id, p?.discard),
    arrange: (t, id, p) => t.arrange(id, p?.order),
    start: (t, id) => t.start(id),
    addBot: (t, id) => t.addBot(id),
    removeSeat: (t, id, p) => t.removeSeat(id, p?.id),
    settings: (t, id, p) => t.updateSettings(id, p?.settings),
    autoplay: (t, id, p) => t.setAutoplay(id, p?.id ?? id, !!p?.on),
    rename: (t, id, p) => t.rename(id, p?.name),
    endMatch: (t, id) => t.endMatch(id),
    newMatch: (t, id) => t.newMatch(id),
  };

  for (const [name, fn] of Object.entries(actions)) {
    socket.on(name, (payload, ack) => {
      const t = tables.get(socket.data.code);
      const id = socket.data.playerId;
      if (!t || !id) return respond(ack, { ok: false, error: "You're not at a table." });
      try {
        fn(t, id, payload);
        // Arranging your own hand only matters to you.
        if (name === "arrange") persist(t);
        else changed(t);
        respond(ack, { ok: true });
      } catch (e) {
        if (!(e instanceof GameError)) console.error(name, e);
        respond(ack, { ok: false, error: e instanceof GameError ? e.message : "Something went wrong." });
      }
    });
  }

  socket.on("disconnect", () => leaveRoom(socket));
});

// ---------- boot ----------

async function main() {
  await store.init();
  for (const s of await store.loadActive()) {
    const t = new Table(s);
    // Nobody is connected right after a restart; give people time to come back.
    for (const seat of s.seats) if (!seat.isBot) t.setConnected(seat.id, false);
    tables.set(s.code, t);
    schedule(t);
  }
  http.listen(PORT, () =>
    console.log(`Marriage table server on http://localhost:${PORT} (${tables.size} tables restored, ${process.env.DATABASE_URL ? "postgres" : "memory"})`),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
