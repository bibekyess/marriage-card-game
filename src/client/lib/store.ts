import { useSyncExternalStore } from "react";
import { io, Socket } from "socket.io-client";
import type { Ack, Session, TableView } from "../../shared/protocol";
import type { Settings } from "../../shared/settings";
import { forgetSession, saveSession, sessionFor } from "./session";
import { saveMatch } from "./history";

// The last view of each table is kept so a refresh shows your cards instantly while reconnecting.
const viewKey = (code: string) => "mg.view." + code.toUpperCase();
function cacheView(v: TableView) {
  try {
    localStorage.setItem(viewKey(v.code), JSON.stringify(v));
  } catch {}
}
function cachedView(code: string, playerId: string): TableView | null {
  try {
    const v = JSON.parse(localStorage.getItem(viewKey(code)) ?? "null") as TableView | null;
    return v && v.code === code.toUpperCase() && v.you === playerId ? v : null;
  } catch {
    return null;
  }
}
/** Drop the seat and the cached view for a table that's gone. */
export function forgetTable(code: string) {
  // A finished match we never saw the end of live still belongs in history.
  const s = sessionFor(code);
  const v = s ? cachedView(code, s.playerId) : null;
  if (v?.status === "matchEnd") saveMatch(v);
  forgetSession(code);
  try {
    localStorage.removeItem(viewKey(code));
  } catch {}
}

// Clean up cached views whose seat is gone (e.g. from older versions).
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k?.startsWith("mg.view.") && !localStorage.getItem("mg.session." + k.slice(8))) localStorage.removeItem(k);
  }
} catch {}

// One socket for the app. The store holds the current table view and connection state;
// components subscribe with useGame().

export interface GameState {
  connected: boolean;
  session: Session | null;
  view: TableView | null;
  /** The view came from the server on this connection (not the cached copy). Actions wait for this. */
  live: boolean;
  /** Set when our seat at a table is gone (table closed, or we were removed). */
  lost: { code: string; error: string } | null;
}

let state: GameState = { connected: false, session: null, view: null, live: false, lost: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<GameState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const socket: Socket = io({ transports: ["websocket", "polling"], autoConnect: true });

// While creating or joining, don't also resume an older seat on reconnect.
let joining = false;

socket.on("connect", () => {
  set({ connected: true });
  // Re-attach to our seat after every (re)connect: refresh, network blip, server restart.
  if (state.session && !joining) resume(state.session.code);
});
socket.on("disconnect", () => set({ connected: false, live: false }));
// The first state can arrive just before the create/join reply, so remember the latest one.
let latest: TableView | null = null;
socket.on("state", (view: TableView) => {
  latest = view;
  const s = state.session;
  if (!s || view.code !== s.code || view.you !== s.playerId) return;
  // Removed by the host, or left from another tab: our seat no longer exists.
  if (!view.seats.some((x) => x.id === view.you) && !view.spectators.some((x) => x.id === view.you)) {
    forgetTable(s.code);
    set({ session: null, view: null, lost: { code: s.code, error: "You're no longer at this table." } });
    return;
  }
  cacheView(view);
  if (view.status === "matchEnd") saveMatch(view);
  set({ view, live: true });
});

export function call<T = unknown>(event: string, payload?: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (!socket.connected) socket.connect();
    socket.timeout(8000).emit(event, payload, (err: unknown, res: Ack<T>) =>
      resolve(err ? { ok: false, error: "Couldn't reach the table. Check your connection." } : res),
    );
  });
}

function adopt(s: Session) {
  saveSession(s);
  const fresh = latest && latest.code === s.code && latest.you === s.playerId ? latest : null;
  // Keep showing the cached table until the live state arrives (no "Taking your seat…" flash).
  const keep = state.view?.code === s.code && state.view.you === s.playerId ? state.view : null;
  set({ session: s, lost: null, view: fresh ?? keep, live: !!fresh });
}

let retry: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 1000;

export async function resume(code: string): Promise<boolean> {
  const s = sessionFor(code);
  if (!s) return false;
  clearTimeout(retry);
  // Show the last known table straight away; the live state replaces it once connected.
  const cached = state.view?.code === s.code && state.view.you === s.playerId ? state.view : cachedView(s.code, s.playerId);
  set({ session: s, view: cached, live: false });
  const r = await call<Session>("resume", { code: s.code, token: s.token });
  if (state.session?.code !== s.code) return false; // navigated elsewhere meanwhile
  if (r.ok && r.data) {
    retryDelay = 1000;
    adopt(r.data);
    return true;
  }
  // Only give up the seat when the server says it's gone, never because the network failed.
  if (r.error && /No table|no longer valid/.test(r.error)) {
    forgetTable(code);
    set({ session: null, view: null, live: false, lost: { code, error: r.error } });
    return false;
  }
  // Anything else (slow server, hiccup): try again, backing off up to 15 s.
  retry = setTimeout(() => state.session?.code === s.code && resume(code), retryDelay);
  retryDelay = Math.min(retryDelay * 2, 15000);
  return false;
}

async function entering(event: string, payload: unknown) {
  joining = true;
  try {
    const r = await call<Session>(event, payload);
    if (r.ok && r.data) adopt(r.data);
    return r;
  } finally {
    joining = false;
  }
}

export const createTable = (name: string, settings: Partial<Settings>, bots = 0) => entering("create", { name, settings, bots });
export const joinTable = (code: string, name: string) => entering("join", { code, name, token: sessionFor(code)?.token });

/** Give up the seat for good. */
export async function leaveTable() {
  const code = state.session?.code;
  await call("leave");
  if (code) forgetTable(code);
  set({ session: null, view: null, live: false });
}

/** Step away from the table (e.g. back to Home) but keep the seat to come back to. */
export function detachTable(code: string) {
  if (state.session?.code !== code) return;
  call("detach");
  clearTimeout(retry);
  set({ session: null, view: null, live: false });
}

/** A game action. The table code is sent along so the server can catch a mixed-up socket. */
export async function act<T = unknown>(event: string, payload?: Record<string, unknown>): Promise<Ack<T>> {
  const code = state.session?.code;
  const r = await call<T>(event, { ...(payload ?? {}), code });
  if (!r.ok && code && (r.error?.startsWith("Out of sync") || r.error?.startsWith("You're not at a table"))) await resume(code);
  return r;
}

export function useGame(): GameState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
