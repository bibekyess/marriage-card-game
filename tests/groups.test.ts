import { describe, expect, it } from "vitest";
import { addGroup, afterDrag, cleanGroups, groupsFirst, readingOrder } from "../src/client/lib/groups";

describe("hand groups", () => {
  it("orders a set for reading, ace last in an ace-high run", () => {
    expect(readingOrder(["KH0", "AH0", "QH0"])).toEqual(["QH0", "KH0", "AH0"]);
    expect(readingOrder(["3D0", "AD0", "2D0"])).toEqual(["AD0", "2D0", "3D0"]);
  });

  it("puts groups first and keeps the rest in order", () => {
    expect(groupsFirst(["9C0", "4H0", "5H0", "2S0", "6H0"], [["4H0", "5H0", "6H0"]])).toEqual(["4H0", "5H0", "6H0", "9C0", "2S0"]);
  });

  it("moves cards out of an old group when they join a new one", () => {
    const g = addGroup([["4H0", "5H0", "6H0", "7H0"]], ["7H0", "7S0", "7D0"]);
    expect(g).toEqual([["4H0", "5H0", "6H0"], readingOrder(["7H0", "7S0", "7D0"])]);
  });

  it("drops groups whose cards left the hand", () => {
    const groups = [["4H0", "5H0", "6H0"], ["9C0", "9C1", "9C2"]];
    expect(cleanGroups(groups, ["4H0", "5H0", "6H0", "9C0", "9C1", "2S0"])).toEqual([["4H0", "5H0", "6H0"]]);
    expect(cleanGroups([["4H0", "5H0"], ["5H0", "6H0"]], ["4H0", "5H0", "6H0"])).toEqual([["4H0", "5H0"]]);
  });

  it("keeps a dragged card in its group only if it lands next to it", () => {
    const groups = [["4H0", "5H0", "6H0"]];
    // Reordered inside the group.
    expect(afterDrag(groups, ["5H0", "4H0", "6H0", "9C0"], "5H0")).toEqual([["5H0", "4H0", "6H0"]]);
    // Dragged out to the loose cards.
    expect(afterDrag(groups, ["4H0", "6H0", "9C0", "5H0"], "5H0")).toEqual([["4H0", "6H0"]]);
    // A group left with one card dissolves.
    expect(afterDrag([["4H0", "5H0"]], ["4H0", "9C0", "5H0"], "5H0")).toEqual([]);
  });
});
