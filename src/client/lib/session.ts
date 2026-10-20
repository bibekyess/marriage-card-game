import type { Session } from "../../shared/protocol";
import { isPlayerLook, PLAYER_LOOKS } from "../../shared/looks";

// Seat tokens live in localStorage so a refresh (or reopening the link) returns you to your seat.

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
};

export const savedName = () => read("mg.name") ?? "";
export const saveName = (n: string) => write("mg.name", n.trim().slice(0, 18));

/** Your avatar picture; null means initials. First visit gets a random one so the table looks lively. */
export function savedLook(): string | null {
  const raw = read("mg.look");
  if (raw === "none") return null;
  if (isPlayerLook(raw)) return raw;
  const pick = PLAYER_LOOKS[Math.floor(Math.random() * PLAYER_LOOKS.length)];
  write("mg.look", pick);
  return pick;
}
export const saveLook = (look: string | null) => write("mg.look", look ?? "none");

export function sessionFor(code: string): Session | null {
  const raw = read("mg.session." + code.toUpperCase());
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}
export const saveSession = (s: Session) => write("mg.session." + s.code, JSON.stringify(s));
export const forgetSession = (code: string) => write("mg.session." + code.toUpperCase(), null);

export function pref<T>(key: string, fallback: T): T {
  const raw = read("mg.pref." + key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
export const setPref = (key: string, v: unknown) => write("mg.pref." + key, JSON.stringify(v));

/** Every table this device holds a seat at. */
export function savedSessions(): Session[] {
  const out: Session[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("mg.session.")) {
        const s = sessionFor(k.slice("mg.session.".length));
        if (s) out.push(s);
      }
    }
  } catch {}
  return out;
}
