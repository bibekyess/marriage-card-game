export type UnseenRule = "murder" | "kidnap" | "count";

export interface Settings {
  rounds: number; // 0 = play until the host ends the match
  pointRate: number;
  currency: string;
  unseenRule: UnseenRule;
  seenPoints: number; // winner gets this from each player who saw the maal
  unseenPoints: number; // ...and this from each player who did not
  dubleeBonus: number; // extra from each player when the winner finished by dublees
  tiplu: number;
  popluJhiplu: number;
  alter: [number, number, number]; // 1, 2 or 3 alter cards
  marriage: number; // tiplu + poplu + jhiplu together
  tunnel: number; // per tunnel shown
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
  tiplu: 3,
  popluJhiplu: 2,
  alter: [5, 15, 25],
  marriage: 10,
  tunnel: 5,
  dublees: true,
  dubleeMinPlayers: 4,
  restrictPickup: true,
  turnTimer: 0,
  botSpeed: "normal",
};

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
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const int = (v: unknown, d: number, min = 0, max = 1000) => Math.round(num(v, d, min, max));

/** Accept untrusted settings from a client and return a clean copy. */
export function sanitizeSettings(raw: Partial<Settings> | undefined, base: Settings = DEFAULT_SETTINGS): Settings {
  const r = (raw || {}) as Partial<Settings>;
  const alter = Array.isArray(r.alter) ? r.alter : base.alter;
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
    tiplu: int(r.tiplu, base.tiplu),
    popluJhiplu: int(r.popluJhiplu, base.popluJhiplu),
    alter: [0, 1, 2].map((i) => int(alter[i], base.alter[i])) as [number, number, number],
    marriage: int(r.marriage, base.marriage),
    tunnel: int(r.tunnel, base.tunnel),
    dublees: typeof r.dublees === "boolean" ? r.dublees : base.dublees,
    dubleeMinPlayers: int(r.dubleeMinPlayers, base.dubleeMinPlayers, 2, 5),
    restrictPickup: typeof r.restrictPickup === "boolean" ? r.restrictPickup : base.restrictPickup,
    turnTimer: [0, 30, 45, 60, 90].includes(Number(r.turnTimer)) ? Number(r.turnTimer) : base.turnTimer,
    botSpeed: (["relaxed", "normal", "fast"] as const).includes(r.botSpeed as Settings["botSpeed"])
      ? (r.botSpeed as Settings["botSpeed"])
      : base.botSpeed,
  };
}

export function dubleesAllowed(s: Settings, players: number) {
  return s.dublees && players >= s.dubleeMinPlayers;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
