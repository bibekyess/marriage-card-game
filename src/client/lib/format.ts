import type { TableView } from "../../shared/protocol";
import { settle, Transfer } from "../../shared/scoring";
import { currencyOf, formatMoney } from "../../shared/settings";

export function totals(v: TableView): Record<string, number> {
  const t: Record<string, number> = Object.fromEntries(v.seats.map((s) => [s.id, 0]));
  for (const r of v.rounds) for (const [id, p] of Object.entries(r.points)) t[id] = (t[id] ?? 0) + p;
  return t;
}

/** Everyone who has scored in this match, including players who have since left. */
export function people(v: TableView) {
  const names: Record<string, string> = Object.fromEntries(v.seats.map((s) => [s.id, s.name]));
  return names;
}

export function money(v: TableView, points: number) {
  return formatMoney(points * v.settings.pointRate, v.settings.currency);
}

export function settlement(v: TableView): { net: Record<string, number>; transfers: Transfer[] } {
  const t = totals(v);
  const f = 10 ** currencyOf(v.settings.currency).decimals;
  const net = Object.fromEntries(Object.entries(t).map(([id, p]) => [id, Math.round(p * v.settings.pointRate * f) / f]));
  return { net, transfers: settle(net) };
}

export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

export function roundLabel(v: TableView) {
  return v.settings.rounds ? `Round ${Math.max(1, v.round)} of ${v.settings.rounds}` : `Round ${Math.max(1, v.round)}`;
}
