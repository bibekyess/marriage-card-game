import { useSyncExternalStore } from "react";
import { io, Socket } from "socket.io-client";
import type { Ack, Session, TableView } from "../../shared/protocol";
import type { Settings } from "../../shared/settings";
import { forgetSession, saveSession, sessionFor } from "./session";

// One socket for the app. The store holds the current table view and connection state;
// components subscribe with useGame().

export interface GameState {
  connected: boolean;
  session: Session | null;
  view: TableView | null;
  /** Set when we tried to resume a table that no longer exists. */
  lost: string | null;
}

let state: GameState = { connected: false, session: null, view: null, lost: null };
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
socket.on("disconnect", () => set({ connected: false }));
// The first state can arrive just before the create/join reply, so remember the latest one.
let latest: TableView | null = null;
socket.on("state", (view: TableView) => {
  latest = view;
  if (state.session && view.code === state.session.code && view.you === state.session.playerId) set({ view });
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
  const view = latest && latest.code === s.code && latest.you === s.playerId ? latest : null;
  set({ session: s, lost: null, view });
}

export async function resume(code: string): Promise<boolean> {
  const s = sessionFor(code);
  if (!s) return false;
  set({ session: s });
  const r = await call<Session>("resume", { code: s.code, token: s.token });
  if (r.ok && r.data) {
    adopt(r.data);
    return true;
  }
  if (r.error && !r.error.startsWith("Couldn't reach")) {
    forgetSession(code);
    set({ session: null, view: null, lost: r.error });
  }
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
  if (code) forgetSession(code);
  set({ session: null, view: null });
}

/** Step away from the table (e.g. back to Home) but keep the seat to come back to. */
export function detachTable() {
  if (!state.session) return;
  call("detach");
  set({ session: null, view: null });
}

/** A game action. The table code is sent along so the server can catch a mixed-up socket. */
export async function act<T = unknown>(event: string, payload?: Record<string, unknown>): Promise<Ack<T>> {
  const code = state.session?.code;
  const r = await call<T>(event, { ...(payload ?? {}), code });
  if (!r.ok && r.error?.startsWith("Out of sync") && code) await resume(code);
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
