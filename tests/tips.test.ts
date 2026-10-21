import { describe, expect, it } from "vitest";
import { BotView, discardTip, drawTip } from "../src/shared/bot";

const view = (hand: string[], extra: Partial<BotView> = {}): BotView => ({
  hand,
  maal: null,
  route: null,
  dubleeAllowed: false,
  restrictPickup: true,
  discardTop: null,
  picked: null,
  setsNeeded: 3,
  ...extra,
});

describe("tips", () => {
  const hand = ["4H0", "5H0", "6H0", "9C0", "9C1", "9C2", "JD0", "QD0", "KD0", "2S0", "3S0", "8H0", "KC1"];

  it("suggests the loneliest card, the same way every time", () => {
    const tips = Array.from({ length: 5 }, () => discardTip(view(hand)));
    expect(new Set(tips.map((t) => t.card)).size).toBe(1);
    expect(tips[0].card).toBe("KC1");
    expect(tips[0].text).toMatch(/doesn't connect/);
  });

  it("never suggests the card just picked up, or a wild card once seen", () => {
    expect(discardTip(view(hand, { picked: "KC1" })).card).not.toBe("KC1");
    const seen = discardTip(view([...hand, "7S0"], { route: "pure", maal: "KC0" }));
    expect(seen.card).not.toBe("KC1"); // an alter of the KC maal: wild
  });

  it("explains which cards a pick-up completes", () => {
    expect(drawTip(view(hand, { discardTop: "4S0" }))).toEqual({ pile: "discard", text: "Take the 4♠: it completes 2♠ 3♠." });
    expect(drawTip(view(hand, { discardTop: "10C0" })).pile).toBe("stock");
  });
});
