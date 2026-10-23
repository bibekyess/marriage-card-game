export type UnseenRule = "murder" | "kidnap" | "count";
/** Points for holding 1, 2 or 3 of a kind of maal card. */
export type Scale = [number, number, number];

export interface Settings {
  rounds: number; // 0 = play until the host ends the match
  pointRate: number;
  currency: string;
  unseenRule: UnseenRule;
  seenPoints: number; // winner gets this from each player who saw the maal
  unseenPoints: number; // ...and this from each player who did not
  dubleeBonus: number; // extra from each player when the winner finished by dublees
  tiplu: Scale;
  popluJhiplu: Scale; // Poplu and Jhiplu are each counted on this scale
  alter: Scale;
  marriage: Scale; // 1, 2 or 3 sets of tiplu + poplu + jhiplu
  tunnel: number; // per tunnel shown
  /** Printed Jokers added to the decks (0–3): wild once the maal is seen. */
  jokers: number;
  jokerPoints: Scale;
  /** Add the printed Bhoot: wild even in pure sets, scores `bhootPoints`, can't be thrown. */
  bhoot: boolean;
  bhootPoints: number;
  dublees: boolean; // allow 7 dublees to see the maal / 8 to win
  dubleeMinPlayers: number;
  restrictPickup: boolean; // before seeing, a thrown card may only be taken to complete a pure set
  turnTimer: number; // seconds, 0 = off
  botSpeed: "relaxed" | "normal" | "fast";
}

export const DEFAULT_SETTINGS: Settings = {
  rounds: 5,
  pointRate: 5,
  currency: "NPR",
  unseenRule: "murder",
  seenPoints: 3,
  unseenPoints: 10,
  dubleeBonus: 5,
  tiplu: [3, 7, 15],
  popluJhiplu: [2, 5, 10],
  alter: [5, 15, 25],
  marriage: [10, 30, 50],
  tunnel: 5,
  jokers: 3,
  jokerPoints: [5, 15, 25],
  bhoot: true,
  bhootPoints: 5,
  dublees: true,
  dubleeMinPlayers: 4,
  restrictPickup: true,
  turnTimer: 0,
  botSpeed: "normal",
};

/** Turn timer choices in seconds (0 = off). */
export const TURN_TIMERS: readonly number[] = [0, 30, 60, 90, 120];
/** Older tables may still have 45s. */
const ALLOWED_TIMERS = [...TURN_TIMERS, 45];

export function timerLabel(s: number) {
  return s === 0 ? "Off" : s >= 120 ? `${s / 60}m` : `${s}s`;
}

export interface Currency {
  code: string;
  symbol: string;
  name: string;
  decimals: number;
}

export const CURRENCIES: Currency[] = [
  { code: "NPR", symbol: "Rs.", name: "Nepali rupee", decimals: 2 },
  { code: "KRW", symbol: "₩", name: "Korean won", decimals: 0 },
  { code: "INR", symbol: "₹", name: "Indian rupee", decimals: 2 },
  { code: "USD", symbol: "$", name: "US dollar", decimals: 2 },
  { code: "AUD", symbol: "A$", name: "Australian dollar", decimals: 2 },
  { code: "GBP", symbol: "£", name: "British pound", decimals: 2 },
  { code: "EUR", symbol: "€", name: "Euro", decimals: 2 },
  { code: "JPY", symbol: "¥", name: "Japanese yen", decimals: 0 },
  { code: "AED", symbol: "AED", name: "UAE dirham", decimals: 2 },
  { code: "QAR", symbol: "QAR", name: "Qatari riyal", decimals: 2 },
  { code: "CAD", symbol: "C$", name: "Canadian dollar", decimals: 2 },
];

export const currencyOf = (code: string) => CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];

export function formatMoney(amount: number, code: string): string {
  const c = currencyOf(code);
  const v = Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: c.decimals,
  });
  return (amount < 0 ? "−" : "") + c.symbol + " " + v;
}

const num = (v: unknown, d: number, min = 0, max = 1e6) => {
  // Only coerce primitives: Number() on a crafted object can throw.
  const n = typeof v === "number" || typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const int = (v: unknown, d: number, min = 0, max = 1000) => Math.round(num(v, d, min, max));
/** Older tables stored a flat number per card; they move to the default scale. */
const scale = (v: unknown, base: unknown, d: Scale): Scale => {
  const b = Array.isArray(base) && base.length === 3 ? (base as Scale) : d;
  const a: unknown[] = Array.isArray(v) ? v : b;
  return [0, 1, 2].map((i) => int(a[i], b[i])) as Scale;
};

/** Accept untrusted settings from a client and return a clean copy. */
export function sanitizeSettings(raw: Partial<Settings> | undefined, base: Settings = DEFAULT_SETTINGS): Settings {
  const r = (raw || {}) as Partial<Settings>;
  return {
    rounds: int(r.rounds, base.rounds, 0, 50),
    pointRate: Math.round(num(r.pointRate, base.pointRate, 0, 1e6) * 100) / 100,
    currency: CURRENCIES.some((c) => c.code === r.currency) ? (r.currency as string) : base.currency,
    unseenRule: (["murder", "kidnap", "count"] as const).includes(r.unseenRule as UnseenRule)
      ? (r.unseenRule as UnseenRule)
      : base.unseenRule,
    seenPoints: int(r.seenPoints, base.seenPoints),
    unseenPoints: int(r.unseenPoints, base.unseenPoints),
    dubleeBonus: int(r.dubleeBonus, base.dubleeBonus),
    tiplu: scale(r.tiplu, base.tiplu, DEFAULT_SETTINGS.tiplu),
    popluJhiplu: scale(r.popluJhiplu, base.popluJhiplu, DEFAULT_SETTINGS.popluJhiplu),
    alter: scale(r.alter, base.alter, DEFAULT_SETTINGS.alter),
    marriage: scale(r.marriage, base.marriage, DEFAULT_SETTINGS.marriage),
    tunnel: int(r.tunnel, base.tunnel),
    jokers: int(r.jokers, base.jokers ?? 0, 0, 3),
    jokerPoints: scale(r.jokerPoints, base.jokerPoints, DEFAULT_SETTINGS.jokerPoints),
    bhoot: typeof r.bhoot === "boolean" ? r.bhoot : (base.bhoot ?? false),
    bhootPoints: int(r.bhootPoints, base.bhootPoints ?? DEFAULT_SETTINGS.bhootPoints),
    dublees: typeof r.dublees === "boolean" ? r.dublees : base.dublees,
    dubleeMinPlayers: int(r.dubleeMinPlayers, base.dubleeMinPlayers, 2, 5),
    restrictPickup: typeof r.restrictPickup === "boolean" ? r.restrictPickup : base.restrictPickup,
    turnTimer: ALLOWED_TIMERS.includes(num(r.turnTimer, -1, -1)) ? num(r.turnTimer, 0) : base.turnTimer,
    botSpeed: (["relaxed", "normal", "fast"] as const).includes(r.botSpeed as Settings["botSpeed"])
      ? (r.botSpeed as Settings["botSpeed"])
      : base.botSpeed,
  };
}

/** Base for tables saved before printed cards existed: they keep playing without them. */
export const LEGACY_SETTINGS: Settings = { ...DEFAULT_SETTINGS, jokers: 0, bhoot: false };

export function dubleesAllowed(s: Settings, players: number) {
  return s.dublees && players >= s.dubleeMinPlayers;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
