import { describe, expect, it } from "vitest";
import { describePlay, newReaction, pickedThisTurn, playKey, recentPicks } from "../src/client/lib/activity";
import { Table } from "../src/server/table";
import { cardLabel } from "../src/shared/cards";
import type { Play } from "../src/shared/protocol";

function table() {
  const { table, seat } = Table.create("ACT", "Bibek", { restrictPickup: false }, 0);
  const guest = table.join("Sita");
  table.start(seat.id);
  return { me: seat.id, other: guest.id, view: () => table.view(seat.id) };
}
const play = (p: Partial<Play> & Pick<Play, "by" | "kind">): Play => ({ t: 1, round: 1, ...p });

describe("activity log", () => {
  it("says when someone takes or passes a card you threw", () => {
    const { me, other, view } = table();
    const v = view();
    const c = cardLabel("4S0");
    expect(describePlay(v, play({ by: me, kind: "throw", card: "4S0" })).text).toBe(`You threw ${c}`);
    expect(describePlay(v, play({ by: other, kind: "pick", card: "4S0", from: me }))).toEqual({ text: `Sita picked up your ${c}`, mine: true });
    expect(describePlay(v, play({ by: other, kind: "stock", card: "4S0", from: me }))).toEqual({ text: `Sita drew from stock, left your ${c}`, mine: true });
    expect(describePlay(v, play({ by: me, kind: "pick", card: "4S0", from: other })).text).toBe(`You picked up ${c} from Sita`);
    expect(describePlay(v, play({ by: other, kind: "show", sets: 3, route: "pure" })).text).toBe("Sita showed 3 pure sets");
  });

  it("only reacts to moves it hasn't seen yet", () => {
    const { me, other, view } = table();
    const v = view();
    const thrown = play({ t: 1, by: me, kind: "throw", card: "4S0" });
    const taken = play({ t: 2, by: other, kind: "pick", card: "4S0", from: me });
    const thrownBack = play({ t: 3, by: other, kind: "throw", card: "9H0" });
    expect(newReaction(v, [thrown, taken], playKey(thrown))).toEqual({ by: "Sita", card: "4S0", taken: true });
    expect(newReaction(v, [thrown, taken, thrownBack], playKey(taken))).toBeNull();
    // Someone else's card passed on is not your news.
    expect(newReaction(v, [play({ by: me, kind: "stock", card: "9H0", from: other })], null)).toBeNull();
  });

  it("shows a pick only for the turn it was made", () => {
    const a = "a";
    const b = "b";
    const picked = play({ by: a, kind: "pick", card: "7H0", from: b });
    expect(pickedThisTurn([picked], 1, a)).toBe("7H0");
    // Showing sets after picking is still the same turn.
    expect(pickedThisTurn([picked, play({ by: a, kind: "show", sets: 3, route: "pure" })], 1, a)).toBe("7H0");
    // Gone once they throw, for other seats, and in a later round.
    expect(pickedThisTurn([picked, play({ by: a, kind: "throw", card: "2S0" })], 1, a)).toBeNull();
    expect(pickedThisTurn([picked], 1, b)).toBeNull();
    expect(pickedThisTurn([picked], 2, a)).toBeNull();
    // Drawing from the stock is not a pick.
    expect(pickedThisTurn([play({ by: a, kind: "stock", card: "7H0", from: b })], 1, a)).toBeNull();
  });

  it("keeps only the last two picks of this round", () => {
    const pick = (by: string, card: string, round = 1) => play({ by, kind: "pick", card, round });
    const plays = [pick("a", "AS0", 0), pick("a", "2S0"), pick("b", "3S0"), pick("a", "4S0"), play({ by: "a", kind: "throw", card: "9H0" }), pick("a", "5S0")];
    expect(recentPicks(plays, 1, "a")).toEqual(["4S0", "5S0"]);
    expect(recentPicks(plays, 1, "b")).toEqual(["3S0"]);
    // An earlier round never leaks in.
    expect(recentPicks(plays.slice(0, 2), 1, "a")).toEqual(["2S0"]);
    expect(recentPicks([], 1, "a")).toEqual([]);
  });
});
