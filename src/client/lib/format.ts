import type { TableView } from "../../shared/protocol";
import { settle, Transfer } from "../../shared/scoring";
import { currencyOf } from "../../shared/settings";

export function totals(v: TableView): Record<string, number> {
  const t: Record<string, number> = Object.fromEntries(v.seats.map((s) => [s.id, 0]));
  for (const r of v.rounds) for (const [id, p] of Object.entries(r.points)) t[id] = (t[id] ?? 0) + p;
  return t;
}

export function settlement(v: TableView): { net: Record<string, number>; transfers: Transfer[] } {
  const t = totals(v);
  const f = 10 ** currencyOf(v.settings.currency).decimals;
  const net = Object.fromEntries(Object.entries(t).map(([id, p]) => [id, Math.round(p * v.settings.pointRate * f) / f]));
  // Rounding each player separately can leave a remainder; give it to the biggest balance so it sums to 0.
  const ids = Object.keys(net);
  const drift = Math.round(ids.reduce((a, id) => a + net[id], 0) * f) / f;
  if (drift && ids.length) {
    const big = ids.reduce((a, b) => (Math.abs(net[b]) > Math.abs(net[a]) ? b : a));
    net[big] = Math.round((net[big] - drift) * f) / f;
  }
  return { net, transfers: settle(net) };
}

/** Display name for anyone who played this match, even if they've left. */
export const nameOf = (v: TableView, id: string) => (id ? v.names?.[id] ?? v.seats.find((s) => s.id === id)?.name ?? "Player" : "—");

export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

export function roundLabel(v: TableView) {
  return v.settings.rounds ? `Round ${Math.max(1, v.round)} of ${v.settings.rounds}` : `Round ${Math.max(1, v.round)}`;
}

/** A turn this long starts to look slow; twice this and we flag it loudly. */
export const SLOW_TURN_SECONDS = 30;

export type TurnPace = "ok" | "slow" | "very-slow";

export const turnPace = (seconds: number): TurnPace =>
  seconds >= SLOW_TURN_SECONDS * 2 ? "very-slow" : seconds >= SLOW_TURN_SECONDS ? "slow" : "ok";

/** "0:07", "1:23", "12:05". */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
