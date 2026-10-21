import { describe, expect, it } from "vitest";
import { describePlay, newReaction, playKey } from "../src/client/lib/activity";
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
});
