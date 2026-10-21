import { describe, expect, it } from "vitest";
import { computeHints, computeShowState, groupedOrder, Hints } from "../src/client/lib/hints";
import type { TableView } from "../src/shared/protocol";
import { sortBySuit } from "../src/shared/cards";
import { findDublees } from "../src/shared/melds";
import { Table } from "../src/server/table";

const SETS = ["AD0", "2D0", "3D0", "7S0", "8S0", "9S2", "JH0", "QH0", "KH0"];
const FILLER = ["2C0", "4D0", "6S0", "8H0", "10C0", "QD0", "KS0", "3H0", "5C0", "7D0", "9S0", "JH1"];

function myTurn(hand: string[]) {
  const { table, seat } = Table.create("HINT", "Host", { restrictPickup: false, dublees: false }, 0);
  table.join("Guest");
  table.start(seat.id);
  const g = table.s.game!;
  g.turn = table.s.seats.findIndex((x) => x.id === seat.id);
  g.phase = "draw";
  g.hands[seat.id] = [...hand];
  const state = (selected: string[] = [], active = true) => {
    const v = table.view(seat.id);
    return computeShowState(v, computeHints(v), new Set(selected), active);
  };
  return { table, id: seat.id, state };
}

describe("Show button", () => {
  it("stays disabled and says how many sets are missing", () => {
    const { state } = myTurn([...SETS.slice(0, 6), ...FILLER, "5H0", "9C0", "JS0"]);
    const s = state()!;
    expect(s.enabled).toBe(false);
    expect(s.label).toBe("Show · 2/3");
    expect(s.reason).toMatch(/1 more pure set /);
    expect(s.suggestion).toBeNull();
  });

  it("asks the player to select their sets instead of picking them", () => {
    const { state } = myTurn([...SETS, ...FILLER]);
    const s = state(SETS.slice(0, 4))!;
    expect(s.enabled).toBe(false);
    expect(s.label).toBe("Show · 4/9");
    expect(s.reason).toMatch(/Select the 9 cards/);
    expect(new Set(s.suggestion)).toEqual(new Set(SETS));
  });

  it("enables Show only for a valid selection", () => {
    const { state } = myTurn([...SETS, ...FILLER]);
    expect(state(SETS)).toMatchObject({ enabled: true, route: "pure", label: "Show 3 pure" });
    expect(state([...SETS.slice(0, 8), "2C0"])!.reason).toMatch(/aren't 3 pure sets/);
  });

  it("is disabled off-turn or offline, and hidden once the maal is seen", () => {
    const { table, id, state } = myTurn([...SETS, ...FILLER]);
    expect(state(SETS, false)).toMatchObject({ enabled: false, reason: "Reconnecting…" });
    const g = table.s.game!;
    g.turn = (g.turn + 1) % table.s.seats.length;
    expect(state(SETS, false)).toMatchObject({ enabled: false, reason: "Wait for your turn to show." });
    g.turn = table.s.seats.findIndex((x) => x.id === id);
    table.show(id, "pure", SETS);
    expect(state()).toBeNull();
  });

  it("needs fewer sets after tunnela", () => {
    const { table, id, state } = myTurn(["9C0", "9C1", "9C2", ...SETS.slice(0, 6), ...FILLER]);
    table.openTunnels(id);
    expect(state(SETS.slice(0, 6))).toMatchObject({ enabled: true, label: "Show 2 pure" });
  });
});

describe("Arrange button", () => {
  it("groups trials and wild-filled sets once the maal is seen", () => {
    const hand = ["KS0", "9S0", "2C0", "9H0", "7C0", "9D0", "5H0", "8C0"];
    const v = { hand, maal: "KD0", finishDiscard: null } as unknown as TableView;
    const { order, groups } = groupedOrder(v, { seen: "pure", dublees: [] } as unknown as Hints);
    expect(groups).toEqual([
      ["7C0", "8C0", "KS0"],
      ["9S0", "9H0", "9D0"],
    ]);
    expect(order.slice(6)).toEqual(["5H0", "2C0"]);
  });
});

describe("Arrange button with dublees", () => {
  const PAIRS = ["KC0", "KC1", "5H0", "5H1", "JD0", "JD1", "2C0", "2C1", "9S0", "9S1", "4D0", "4D1"];
  const arrange = (hand: string[], dubleeOk: boolean, setsNeeded = 3) =>
    groupedOrder(
      { hand, maal: null, finishDiscard: null } as unknown as TableView,
      { seen: null, dublees: findDublees(hand), dubleeOk, setsNeeded } as unknown as Hints,
    ).groups;

  it("lays out the dublees, in suit order, when chasing them", () => {
    const groups = arrange([...PAIRS, "6S0", "7S0", "8S0", "3H0", "10C0", "QS0"], true);
    expect(groups).toHaveLength(6);
    expect(groups.every((g) => g.length === 2)).toBe(true);
    expect(groups.map((g) => g[0])).toEqual(sortBySuit(groups.map((g) => g[0])));
  });

  it("never groups dublees when they can't be shown", () => {
    const hand = [...PAIRS, "6S0", "7S0", "8S0", "3H0", "10C0", "QS0"];
    expect(arrange(hand, false)).toEqual([["6S0", "7S0", "8S0", "9S0"]]);
    expect(arrange(hand, true, 2)).toEqual([["6S0", "7S0", "8S0", "9S0"]]); // tunnela shown at the start
    expect(arrange(["KC0", "KC1", "3H0", "7D0"], false)).toEqual([]);
  });

  it("groups even a couple of pairs when there's no pure set", () => {
    expect(arrange(["KC0", "KC1", "3H0", "5H0", "5H1", "9D0"], true)).toEqual([
      ["5H0", "5H1"],
      ["KC0", "KC1"],
    ]);
  });
});
