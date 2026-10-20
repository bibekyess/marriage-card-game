import type { RoundRow, TableView } from "../../shared/protocol";
import type { Settings } from "../../shared/settings";

// Finished matches are kept on this device (no accounts), newest first.

export interface MatchRecord {
  id: string; // code + match start time
  code: string;
  startedAt: number;
  endedAt: number;
  you: string;
  players: { id: string; name: string; avatar: number; look?: string; isBot: boolean }[];
  rounds: RoundRow[];
  settings: Settings;
}

const KEY = "mg.history";
const MAX = 60;

function read(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as MatchRecord[]) : [];
    return Array.isArray(list) ? list.filter((m) => m && m.id && Array.isArray(m.rounds)) : [];
  } catch {
    return [];
  }
}

function write(list: MatchRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...list].sort((a, b) => b.endedAt - a.endedAt).slice(0, MAX)));
  } catch {}
}

export const listMatches = (): MatchRecord[] => read().sort((a, b) => b.endedAt - a.endedAt);

/** Save (or update) the match this view belongs to. Called when a match ends. */
export function saveMatch(v: TableView) {
  if (!v.rounds.length) return;
  // Spectators didn't play: nothing of theirs to remember.
  if (!v.rounds.some((r) => v.you in r.points)) return;
  const id = `${v.code}-${v.matchStartedAt}`;
  const existing = read();
  // Saved already (e.g. the final screen was refreshed): keep the record as it was at the end.
  if (existing.some((m) => m.id === id)) return;
  const ids = new Set(v.rounds.flatMap((r) => Object.keys(r.points)));
  const seat = (pid: string) => v.seats.find((s) => s.id === pid);
  const rec: MatchRecord = {
    id,
    code: v.code,
    startedAt: v.matchStartedAt,
    endedAt: Date.now(),
    you: v.you,
    players: [...ids].map((pid) => ({
      id: pid,
      name: v.names?.[pid] ?? seat(pid)?.name ?? "Player",
      avatar: seat(pid)?.avatar ?? 0,
      look: seat(pid)?.look,
      isBot: seat(pid)?.isBot ?? false,
    })),
    rounds: v.rounds,
    settings: v.settings,
  };
  write([rec, ...existing]);
}

export function deleteMatch(id: string) {
  write(read().filter((m) => m.id !== id));
}

/** A read-only table view of a past match, so the scoreboard/settle-up screens can show it. */
export function viewFromRecord(m: MatchRecord): TableView {
  return {
    code: m.code,
    you: m.you,
    hostId: "",
    practice: false,
    settings: m.settings,
    status: "matchEnd",
    round: m.rounds.length,
    seats: m.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      look: p.look,
      isBot: p.isBot,
      connected: true,
      autoplay: false,
      cardCount: 0,
      seen: null,
      shown: [],
      thrown: [],
    })),
    dealer: 0,
    turn: -1,
    phase: "draw",
    stockCount: 0,
    discardTop: null,
    discardBy: null,
    discardRecent: [],
    maal: null,
    maalHidden: false,
    hand: [],
    drawn: null,
    picked: null,
    deadline: null,
    turnStartedAt: null,
    rounds: m.rounds,
    reveal: null,
    log: [],
    spectators: [],
    names: Object.fromEntries(m.players.map((p) => [p.id, p.name])),
    matchStartedAt: m.startedAt,
    serverNow: Date.now(),
    canDeclare: false,
    finishDiscard: null,
    canOpenTunnels: false,
    setsNeeded: 3,
  };
}
