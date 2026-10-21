import { beforeEach, describe, expect, it } from "vitest";
import { Table } from "../src/server/table";

// Minimal localStorage for the browser-side history module.
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};
const { deleteMatch, listMatches, saveMatch, viewFromRecord } = await import("../src/client/lib/history");
const { settlement, totals } = await import("../src/client/lib/format");

function finishedView() {
  const { table, seat } = Table.create("HIST", "Bibek", { rounds: 1 }, 2);
  table.setAutoplay(seat.id, seat.id, true);
  table.start(seat.id);
  for (let i = 0; i < 20000 && table.s.status === "playing"; i++) table.autoStep("bot");
  return table.view(seat.id);
}

describe("match history", () => {
  beforeEach(() => mem.clear());

  it("saves a finished match once, keeps names, and rebuilds the same settlement", () => {
    const v = finishedView();
    expect(v.status).toBe("matchEnd");
    saveMatch(v);
    saveMatch(v); // e.g. the page was refreshed on the final screen
    const list = listMatches();
    expect(list).toHaveLength(1);
    const m = list[0];
    expect(m.players.map((p) => p.name).sort()).toEqual(["Anisha", "Bibek", "Rohan"]);
    const back = viewFromRecord(m);
    expect(totals(back)).toEqual(totals(v));
    expect(settlement(back)).toEqual(settlement(v));
    deleteMatch(m.id);
    expect(listMatches()).toHaveLength(0);
  });

  it("ignores corrupted storage", () => {
    mem.set("mg.history", "{not json");
    expect(listMatches()).toEqual([]);
  });
});
