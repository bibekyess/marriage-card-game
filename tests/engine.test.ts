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

describe("review fixes", () => {
  const twoPlayer = (settings = {}) => {
    const { table, seat } = Table.create("FIX", "Host", { restrictPickup: false, ...settings }, 0);
    const other = table.join("Guest");
    table.start(seat.id);
    return { table, host: seat.id, guest: other.id };
  };

  it("rejects duplicate or partial card selections when showing", () => {
    expect(findShow(["4H0", "5H0", "6H0"], ["4H0", "5H0", "6H0", "4H0", "5H0", "6H0", "4H0", "5H0", "6H0"])).toBeNull();
    expect(findShow(["4H0", "5H0", "6H0", "9C0"], ["4H0", "5H0"])).toBeNull();
    const pairs = ["AH0", "AH1"];
    expect(findDubleeShow(pairs, Array(7).fill(pairs).flat())).toBeNull();
    const { table, host } = twoPlayer();
    table.draw(host, "stock");
    const hand = table.s.game!.hands[host];
    const dup = Array(9).fill(hand[0]);
    expect(() => table.show(host, "pure", dup)).toThrow();
    expect(table.s.game!.hands[host]).toHaveLength(22);
  });

  it("lets a player show sets already in hand before drawing", () => {
    const { table, host } = twoPlayer();
    const g = table.s.game!;
    const sets = ["AD0", "2D0", "3D0", "7S0", "8S0", "9S2", "JH0", "QH0", "KH0"];
    g.hands[host] = [...sets, ...g.hands[host].filter((c) => !sets.includes(c))].slice(0, 21);
    const turn = g.turn;
    expect(g.phase).toBe("draw");
    table.show(host, "pure", sets);
    expect(g.seen[host]).toBe("pure");
    expect(g.hands[host]).toHaveLength(12);
    expect(() => table.declare(host)).toThrow(/Draw a card first/);
    table.draw(host, "stock");
    table.discard(host, g.hands[host][0]);
    expect(g.turn).not.toBe(turn);
  });

  it("reveals the maal at once when sets are shown before drawing", () => {
    const { table, host } = twoPlayer();
    const g = table.s.game!;
    const sets = ["AD0", "2D0", "3D0", "7S0", "8S0", "9S2", "JH0", "QH0", "KH0"];
    g.hands[host] = [...sets, ...g.hands[host].filter((c) => !sets.includes(c))].slice(0, 21);
    table.show(host, "pure", sets);
    expect(table.view(host).maal).toBe(g.maal);
    expect(table.botView(host).maal).toBe(g.maal);
  });

  it("keeps the maal hidden until a card is thrown when sets are shown after drawing", () => {
    const { table, host } = twoPlayer();
    const g = table.s.game!;
    const sets = ["AD0", "2D0", "3D0", "7S0", "8S0", "9S2", "JH0", "QH0", "KH0"];
    g.hands[host] = [...sets, ...g.hands[host].filter((c) => !sets.includes(c))].slice(0, 21);
    table.draw(host, "stock");
    table.show(host, "pure", sets);
    expect(g.seen[host]).toBe("pure");
    expect(table.view(host).maal).toBeNull();
    expect(table.view(host).maalHidden).toBe(true);
    expect(table.botView(host).maal).toBeNull();
    table.discard(host, g.hands[host][0]);
    expect(table.view(host).maal).toBe(g.maal);
    expect(table.view(host).maalHidden).toBe(false);
  });

  it("only allows natural sets to finish in the turn the sets were shown after drawing", () => {
    const { table, host } = twoPlayer();
    const g = table.s.game!;
    g.maal = "5C0"; // the other 5C is a tiplu (wild) once the maal is seen
    const sets = ["AD0", "2D0", "3D0", "7S0", "8S0", "9S2", "JH0", "QH0", "KH0"];
    // 4H 6H only make a set with 5C as a wild; KC is the throw.
    g.hands[host] = [...sets, "9D0", "9S0", "9H0", "2S0", "3S0", "4S0", "10C0", "JC0", "QC0", "4H0", "6H0", "5C1"];
    g.phase = "discard";
    g.turn = table.s.seats.findIndex((x) => x.id === host);
    g.started = { [host]: true };
    table.show(host, "pure", sets);
    g.hands[host].push("KC0");
    expect(table.view(host).canDeclare).toBe(false);
    expect(() => table.declare(host)).toThrow(/complete sets/);
  });

  it("scores a winner's tunnel no matter how the hand is arranged", () => {
    const maal = "2S0";
    const a = ["9H0", "9D0", "9C0", "9C1", "9H1", "9S0", "9C2", "9D1", "9S1", "4H0", "5H0", "6H0", "KC1"];
    const b = ["9C0", "9C1", "9C2", ...a.filter((c) => !c.startsWith("9C"))];
    const scoreFor = (hand: string[]) => {
      const { table, host } = twoPlayer();
      const g = table.s.game!;
      g.maal = maal;
      g.seen[host] = "pure";
      g.shown[host] = [["AD0", "2D0", "3D0"], ["7S0", "8S0", "9S2"], ["JH0", "QH0", "KH0"]];
      g.hands[host] = [...hand];
      g.phase = "discard";
      table.declare(host);
      return table.s.reveal!.players.find((p) => p.id === host)!.breakdown.tunnels;
    };
    // Tunnels only score when shown at the start, so a held one is worth nothing however it's arranged.
    expect(scoreFor(a)).toBe(0);
    expect(scoreFor(b)).toBe(0);
  });

  describe("tunnela shown at the start", () => {
    const deal = (hand: string[]) => {
      const { table, host, guest } = twoPlayer();
      const g = table.s.game!;
      const turn = table.s.seats.findIndex((x) => x.id === host);
      g.turn = turn;
      g.phase = "draw";
      g.hands[host] = [...hand];
      return { table, host, guest, g };
    };
    const filler = ["2C0", "4D0", "6S0", "8H0", "10C0", "QD0", "KS0", "3H0", "5C0", "7D0", "9S0", "JH0"];

    it("lets a player show tunnels only before their first draw", () => {
      const { table, host, g } = deal(["9C0", "9C1", "9C2", "4H0", "5H0", "6H0", "AS0", "2S0", "3S0", ...filler]);
      expect(table.view(host).canOpenTunnels).toBe(true);
      table.openTunnels(host);
      expect(g.opened![host]).toEqual([["9C0", "9C1", "9C2"]]);
      expect(g.hands[host]).toHaveLength(18);
      expect(table.view(host).setsNeeded).toBe(2);
      expect(table.view(host).canOpenTunnels).toBe(false);
      // The remaining two pure sets are enough to see the maal.
      table.show(host, "pure");
      expect(g.seen[host]).toBe("pure");
      expect(g.shown[host]).toHaveLength(3);
    });

    it("refuses the opening show once the player has drawn", () => {
      const { table, host, guest, g } = deal(["9C0", "9C1", "9C2", ...filler, "4H0", "5H0", "6H0", "AS0", "2S0", "3S0"]);
      table.draw(host, "stock");
      table.discard(host, g.hands[host].find((c) => !c.startsWith("9C"))!);
      table.draw(guest, "stock");
      table.discard(guest, g.hands[guest][0]);
      expect(table.view(host).canOpenTunnels).toBe(false);
      expect(() => table.openTunnels(host)).toThrow(/before your first draw/);
    });

    it("sees the maal at once with three tunnels", () => {
      const { table, host, g } = deal(["9C0", "9C1", "9C2", "KD0", "KD1", "KD2", "4S0", "4S1", "4S2", ...filler]);
      table.openTunnels(host);
      expect(g.seen[host]).toBe("pure");
      expect(table.view(host).maal).toBe(g.maal);
    });

    it("scores opened tunnels only if the maal was seen", () => {
      const settle = (seen: boolean) => {
        const { table, host, guest, g } = deal(["9C0", "9C1", "9C2", ...filler, "AS0", "2S0", "3S0", "4H0", "5H0", "6H0"]);
        table.openTunnels(host);
        g.maal = "2S0";
        if (seen) g.seen[host] = "pure";
        // The guest wins straight away.
        g.turn = table.s.seats.findIndex((x) => x.id === guest);
        g.phase = "discard";
        g.seen[guest] = "pure";
        g.shown[guest] = [["AD0", "2D0", "3D0"], ["7S0", "8S0", "9S2"], ["JH0", "QH0", "KH0"]];
        g.hands[guest] = ["9H0", "9D0", "9S0", "4H1", "5H1", "6H1", "KC1", "KD1", "KS1", "6C0", "7C0", "8C0", "3C1"];
        g.picked = null;
        table.declare(guest);
        return table.s.reveal!.players.find((p) => p.id === host)!.breakdown.tunnels;
      };
      expect(settle(true)).toBe(1);
      expect(settle(false)).toBe(0);
    });

    it("closes the dublee route after showing tunnels", () => {
      const { table, host } = deal(["9C0", "9C1", "9C2", ...filler, "4H0", "5H0", "6H0", "AS0", "2S0", "3S0"]);
      table.openTunnels(host);
      expect(() => table.show(host, "dublee")).toThrow(/pure sets/);
    });
  });

  it("keeps the deal rotating after someone leaves", () => {
    const { table, seat } = Table.create("ROT", "A", {}, 0);
    const b = table.join("B"), c = table.join("C");
    table.start(seat.id); // round 1: C (last seat) deals
    expect(table.s.seats[table.s.dealer].id).toBe(c.id);
    table.s.status = "roundEnd";
    table.start(seat.id); // round 2: A deals
    expect(table.s.seats[table.s.dealer].id).toBe(seat.id);
    table.s.status = "roundEnd";
    table.removeSeat(seat.id, b.id);
    table.start(seat.id); // round 3: B would have dealt but left → next seat (C)
    expect(table.s.seats[table.s.dealer].id).toBe(c.id);
  });

  it("calls a round off when the stock keeps running out", () => {
    const { table, host } = twoPlayer();
    const g = table.s.game!;
    g.reshuffles = 3;
    g.stock = [];
    table.draw(host, "stock");
    expect(table.s.status).toBe("roundEnd");
    expect(table.s.rounds.at(-1)!.winnerId).toBe("");
    expect(Object.values(table.s.rounds.at(-1)!.points)).toEqual([0, 0]);
  });

  it("lets a bot take over when someone leaves mid-round, and hands over the host", () => {
    const { table, host, guest } = twoPlayer();
    table.setConnected(guest, true);
    expect(table.leave(host)).toEqual({ removed: true });
    expect(table.s.hostId).toBe(guest);
    expect(table.s.seats[0].autoplay).toBe(true);
    expect(table.nextStep()?.kind).toBe("bot");
    table.s.status = "roundEnd";
    table.addBot(guest);
    table.start(guest);
    expect(table.s.seats.map((s) => s.isBot)).toEqual([false, true]);
    expect(table.s.seats[0].id).toBe(guest);
  });

  it("ignores hand arrangements that aren't real cards", () => {
    const { table, host } = twoPlayer();
    const hand = [...table.s.game!.hands[host]];
    table.arrange(host, hand.map((c) => [c]) as any);
    expect(table.s.game!.hands[host]).toEqual(hand);
  });

  describe("declaring with the player's own sets", () => {
    const SETS = [["9C0", "9C1", "9C2"], ["9H0", "9D0", "9S0"], ["4H0", "5H0", "6H0"], ["KC0", "KD0", "KS0"]];
    const ready = (route: "pure" | "dublee" = "pure", hand = [...SETS.flat(), "3C1"]) => {
      const { table, host } = twoPlayer();
      const g = table.s.game!;
      g.turn = table.s.seats.findIndex((x) => x.id === host);
      g.maal = "2S0";
      g.seen[host] = route;
      g.shown[host] = [["AD0", "2D0", "3D0"], ["7S0", "8S0", "9S2"], ["JH0", "QH0", "KH0"]];
      g.hands[host] = hand;
      g.phase = "discard";
      g.picked = null;
      return { table, host, g };
    };

    it("wins with valid sets and the last card thrown", () => {
      const { table, host } = ready();
      table.declare(host, "3C1", SETS);
      expect(table.s.status).toBe("roundEnd");
      const me = table.s.reveal!.players.find((p) => p.id === host)!;
      expect(table.s.reveal!.winnerId).toBe(host);
      expect(me.groups).toEqual(SETS);
      expect(table.s.reveal!.discard).toBe("3C1");
    });

    it("refuses a set that isn't valid", () => {
      const { table, host } = ready();
      const bad = [SETS[0], SETS[1], ["4H0", "5H0", "3C1"], SETS[3]];
      expect(() => table.declare(host, "6H0", bad)).toThrow(/isn't a valid set/);
      expect(table.s.status).toBe("playing");
    });

    it("refuses when cards are left over or not in the hand", () => {
      const { table, host } = ready();
      expect(() => table.declare(host, "3C1", SETS.slice(0, 3))).toThrow(/every card except/);
      expect(() => table.declare(host, "3C1", [...SETS.slice(0, 3), ["KC0", "KD0", "KH2"]])).toThrow(/aren't all in your hand/);
      expect(() => table.declare(host, "3C1", [...SETS, ["9C0"]])).toThrow(/aren't all in your hand/);
    });

    it("won't throw back the card just picked up", () => {
      const { table, host, g } = ready();
      g.picked = "3C1";
      expect(() => table.declare(host, "3C1", SETS)).toThrow(/throw back/);
    });

    it("wins the dublee route with an 8th dublee", () => {
      const { table, host } = ready("dublee", ["AH0", "AH1", "3C0", "5D0", "7S1", "9H2", "JC0", "QD1"]);
      expect(() => table.declare(host, "3C0", [["AH0", "5D0"]])).toThrow(/one more dublee/);
      table.declare(host, "3C0", [["AH0", "AH1"]]);
      expect(table.s.reveal!.winnerId).toBe(host);
    });
  });

  it("timeout auto-play declares a finished hand", () => {
    const { table, host } = twoPlayer();
    const g = table.s.game!;
    g.maal = "2S0";
    g.seen[host] = "pure";
    g.shown[host] = [["AD0", "2D0", "3D0"], ["7S0", "8S0", "9S2"], ["JH0", "QH0", "KH0"]];
    g.hands[host] = ["9C0", "9C1", "9C2", "9H0", "9D0", "9S0", "4H0", "5H0", "6H0", "KC0", "KD0", "KS0"];
    g.stock.push("3C1");
    table.autoStep("timeout");
    expect(table.s.status).toBe("roundEnd");
    expect(table.s.reveal!.winnerId).toBe(host);
  });
});

describe("re-review fixes", () => {
  it("a lone host leaving doesn't orphan the table", () => {
    const { table, seat } = Table.create("ORPH", "Host", {}, 1);
    table.start(seat.id);
    table.leave(seat.id);
    const late = table.join("Late");
    expect(table.s.hostId).toBe(late.id);
  });

  it("coming back with your token keeps a seat you 'left'", () => {
    const { table, seat } = Table.create("BACK", "Host", {}, 0);
    const g = table.join("Guest");
    table.start(seat.id);
    table.leave(g.id);
    expect(table.s.seats[1].left).toBe(true);
    table.reclaim(g.id);
    expect(table.s.seats[1].left).toBe(false);
    expect(table.s.seats[1].autoplay).toBe(false);
  });

  it("start() changes nothing when there aren't enough players", () => {
    const { table, seat } = Table.create("FEW", "Host", {}, 0);
    expect(() => table.start(seat.id)).toThrow(/at least 2/);
    expect(table.s.status).toBe("lobby");
  });

  it("declaring picks the throw worth the most, whatever the hand order", () => {
    const maal = "4H0";
    const base = ["5C0", "5C1", "5C2", "5D0", "5S0", "6C0", "7C0", "8C0", "9D0", "9S0", "9H1", "3H0", "7C1"];
    const results = [base, [...base].reverse()].map((hand) => {
      const { table, seat } = Table.create("BEST", "Host", { restrictPickup: false }, 0);
      table.join("G");
      table.start(seat.id);
      const g = table.s.game!;
      g.maal = maal;
      g.seen[seat.id] = "pure";
      g.shown[seat.id] = [["AD0", "2D0", "3D0"], ["7S0", "8S0", "9S2"], ["JH0", "QH0", "KH0"]];
      g.hands[seat.id] = [...hand];
      g.phase = "discard";
      g.picked = null;
      if (!table.view(seat.id).canDeclare) return null;
      table.declare(seat.id);
      return table.s.reveal!.players.find((p) => p.id === seat.id)!.rawMaal;
    });
    expect(results[0]).not.toBeNull();
    expect(results[0]).toBe(results[1]);
  });
});
