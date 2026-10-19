import { describe, expect, it } from "vitest";
import { maalKind } from "../src/shared/cards";
import {
  completesPure,
  findDubleeFinish,
  findDubleeShow,
  findFinish,
  findShow,
  isPureSequence,
  isSequence,
  isTrial,
  isTunnel,
} from "../src/shared/melds";
import { maalPoints, scoreRound, settle } from "../src/shared/scoring";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../src/shared/settings";
import { Table } from "../src/server/table";

const S = DEFAULT_SETTINGS;

describe("melds", () => {
  it("recognises pure sequences, including ace high and low", () => {
    expect(isPureSequence(["4H0", "5H0", "6H1"])).toBe(true);
    expect(isPureSequence(["QS0", "KS0", "AS2"])).toBe(true);
    expect(isPureSequence(["AS0", "2S0", "3S0"])).toBe(true);
    expect(isPureSequence(["KS0", "AS0", "2S0"])).toBe(false);
    expect(isPureSequence(["4H0", "5H0", "7H0"])).toBe(false);
    expect(isPureSequence(["4H0", "5C0", "6H0"])).toBe(false);
  });

  it("recognises tunnels only with three identical cards", () => {
    expect(isTunnel(["9C0", "9C1", "9C2"])).toBe(true);
    expect(isTunnel(["9C0", "9C1", "9S2"])).toBe(false);
  });

  it("lets maal cards fill sequences and trials", () => {
    const maal = "7D0"; // tiplu 7♦, poplu 8♦, jhiplu 6♦, alter 7♥, jokers 7♠ 7♣
    expect(maalKind("7H1", maal)).toBe("alter");
    expect(maalKind("7S1", maal)).toBe("joker");
    expect(maalKind("8D1", maal)).toBe("poplu");
    expect(maalKind("6D1", maal)).toBe("jhiplu");
    expect(isSequence(["4H0", "7S0", "6H0"], maal)).toBe(true);
    expect(isSequence(["4H0", "9H0", "7S0"], maal)).toBe(false);
    expect(isTrial(["QH0", "QS0", "7C0"], maal)).toBe(true);
    expect(isTrial(["QH0", "QH1", "7C0"], maal)).toBe(false);
  });

  it("finds three pure sets to show", () => {
    const hand = ["4H0", "5H0", "6H0", "9C0", "9C1", "9C2", "QS0", "KS0", "AS0", "2D0", "8S1"];
    const show = findShow(hand)!;
    expect(show).toHaveLength(3);
    expect(findShow(["4H0", "5H0", "6H0", "9C0", "9C1", "2D0"])).toBeNull();
  });

  it("finds a winning hand with a wild card", () => {
    const maal = "7D0";
    // 12 cards to meld + 1 to throw
    const hand = ["2C0", "3C0", "4C0", "JH0", "JS0", "7S0", "8S0", "9S0", "10S1", "5D0", "5H0", "5S1", "3D2"];
    const f = findFinish(hand, maal)!;
    expect(f).not.toBeNull();
    expect(f.discard).toBe("3D2");
    expect(findFinish(hand, maal, { forbidden: "3D2" })).toBeNull();
  });

  it("handles the dublee route", () => {
    const pairs = ["2C", "5H", "9S", "JD", "KC", "3S", "7H"].flatMap((f) => [f + "0", f + "1"]);
    const hand = [...pairs, "4D0", "8C0", "QS0", "AH0", "6S0", "10D0", "2H0", "KS0"];
    expect(findDubleeShow(hand)).toHaveLength(7);
    expect(findDubleeFinish(["4D0", "4D2", "QS0", "AH0", "6S0", "10D0", "2H0", "KS0"])).not.toBeNull();
    expect(findDubleeFinish(["4D0", "5D2", "QS0", "AH0", "6S0", "10D0", "2H0", "KS0"])).toBeNull();
  });

  it("only allows pick-ups that complete a pure set before seeing", () => {
    expect(completesPure(["4H0", "5H0", "9C0"], "6H2", false)).toBe(true);
    expect(completesPure(["4H0", "5S0", "9C0"], "6H2", false)).toBe(false);
    expect(completesPure(["4H0", "5S0", "9C0"], "9C2", true)).toBe(true);
  });
});

describe("scoring", () => {
  it("scores maal with marriage and alter tiers", () => {
    const maal = "7D0";
    const b = maalPoints(["7D1", "8D0", "6D2", "7H0", "7H1"], [], maal, S);
    // marriage 10 + alter ×2 = 15
    expect(b.marriages).toBe(1);
    expect(b.points).toBe(10 + 15);
  });

  it("matches the MPC example: 2 players, unseen loser, no maal", () => {
    const rows = scoreRound(
      [
        { id: "a", seen: true, cards: [], shown: [] },
        { id: "b", seen: false, cards: [], shown: [] },
      ],
      "a",
      "2C0",
      S,
      false,
    );
    expect(rows.map((r) => r.points)).toEqual([10, -10]);
  });

  it("settles maal differences between every pair", () => {
    const maal = "7D0";
    const rows = scoreRound(
      [
        { id: "w", seen: true, cards: ["7D1"], shown: [] }, // 3
        { id: "x", seen: true, cards: ["7D2", "8D0", "6D0"], shown: [] }, // marriage 10
        { id: "y", seen: false, cards: ["7D0"], shown: [] }, // murdered: 0
        { id: "z", seen: true, cards: [], shown: [] }, // 0
      ],
      "w",
      maal,
      S,
      false,
    );
    const p = Object.fromEntries(rows.map((r) => [r.id, r.points]));
    // total maal 13; N=4
    expect(p.x).toBe(4 * 10 - 13 - 3);
    expect(p.y).toBe(0 - 13 - 10);
    expect(p.z).toBe(0 - 13 - 3);
    expect(p.w).toBe(4 * 3 - 13 + 3 + 10 + 3);
    expect(rows.reduce((a, r) => a + r.points, 0)).toBe(0);
  });

  it("kidnap gives the unseen player's maal to the winner", () => {
    const s = { ...S, unseenRule: "kidnap" as const };
    const rows = scoreRound(
      [
        { id: "w", seen: true, cards: [], shown: [] },
        { id: "y", seen: false, cards: ["7D0"], shown: [] },
      ],
      "w",
      "7D1",
      s,
      false,
    );
    expect(rows[0].points).toBe(2 * 3 - 3 + 10);
    expect(rows[1].points).toBe(-13);
  });

  it("settles with the fewest payments", () => {
    const t = settle({ a: 100, b: -60, c: -40 });
    expect(t).toEqual([
      { from: "b", to: "a", amount: 60 },
      { from: "c", to: "a", amount: 40 },
    ]);
    expect(settle({ a: 0, b: 0 })).toEqual([]);
  });

  it("sanitises untrusted settings", () => {
    const s = sanitizeSettings({ pointRate: -4, currency: "XXX", rounds: 999 as any, unseenRule: "nope" as any });
    expect(s.pointRate).toBe(0);
    expect(s.currency).toBe("NPR");
    expect(s.rounds).toBe(50);
    expect(s.unseenRule).toBe("murder");
  });
});

describe("table", () => {
  it("plays complete bot-only matches without getting stuck", () => {
    for (let game = 0; game < 6; game++) {
      const { table, seat } = Table.create("TEST", "Host", { rounds: 2 }, 3);
      table.setAutoplay(seat.id, seat.id, true);
      table.start(seat.id);
      let steps = 0;
      while (table.s.status !== "matchEnd" && steps < 20000) {
        if (table.s.status === "roundEnd") table.start(seat.id);
        else table.autoStep("bot");
        steps++;
      }
      expect(table.s.status).toBe("matchEnd");
      expect(table.s.rounds).toHaveLength(2);
      for (const r of table.s.rounds) expect(Object.values(r.points).reduce((a, b) => a + b, 0)).toBe(0);
    }
  });

  it("keeps hands private in views", () => {
    const { table, seat } = Table.create("PRIV", "Host", {}, 0);
    const other = table.join("Guest");
    table.start(seat.id);
    const v = table.view(other.id);
    expect(v.hand).toHaveLength(21);
    expect(v.maal).toBeNull();
    expect(JSON.stringify(v)).not.toContain(table.s.game!.hands[seat.id].join('","'));
    expect(table.byToken(other.token)).toBe(other.id);
  });

  it("enforces turn order and the no-throw-back rule", () => {
    const { table, seat } = Table.create("RULE", "Host", { restrictPickup: false }, 0);
    const other = table.join("Guest");
    table.start(seat.id);
    expect(() => table.draw(other.id, "stock")).toThrow(/not your turn/);
    table.draw(seat.id, "discard");
    const picked = table.s.game!.picked!;
    expect(() => table.discard(seat.id, picked)).toThrow(/throw back/);
  });
});
