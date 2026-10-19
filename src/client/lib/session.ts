import type { Session } from "../../shared/protocol";

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
