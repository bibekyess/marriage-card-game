import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, BarChart3, Eye, Layers, Menu, Sparkles, Trophy, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Hand } from "@/components/game/Hand";
import { Piles } from "@/components/game/Piles";
import { Seat } from "@/components/game/Seat";
import { PlayingCard } from "@/components/game/PlayingCard";
import { computeHints, groupedOrder } from "@/lib/hints";
import { roundLabel, signed, totals } from "@/lib/format";
import { act } from "@/lib/store";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { RoundResult } from "./RoundResult";
import { ScoreSheet } from "./ScoreSheet";
import { MenuSheet } from "./MenuSheet";
import { CardId, sortByRank, sortBySuit } from "../../shared/cards";
import type { TableView } from "../../shared/protocol";

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

async function run(event: string, payload?: Record<string, unknown>) {
  const r = await act(event, payload);
  if (!r.ok) {
    sfx.error();
    toast.error(r.error ?? "Something went wrong.");
  }
  return r.ok;
}

/** Opponent positions around the top of the oval, by number of opponents. */
const SPOTS: Record<number, [number, number][]> = {
  1: [[50, 9]],
  2: [[14, 30], [86, 30]],
  3: [[12, 36], [50, 8], [88, 36]],
  4: [[10, 42], [30, 9], [70, 9], [90, 42]],
};

export function TableScreen({ view: v, connected }: { view: TableView; connected: boolean }) {
  const vp = useViewport();
  const landscape = vp.w > vp.h;
  const h = useMemo(() => computeHints(v), [v]);
  const me = v.seats[h.myIndex];
  const seated = h.myIndex >= 0;
  const playing = v.status === "playing";

  // Card sizes follow the screen.
  const handCw = Math.round(landscape ? Math.min(vp.h * 0.17, vp.w * 0.062, 84) : Math.min(vp.w * 0.125, 60));
  const pileCw = Math.round(landscape ? Math.min(vp.h * 0.16, 76) : Math.min(vp.w * 0.15, 64));

  // Local card order (instant feedback); server keeps it so a refresh keeps your arrangement.
  const [order, setOrder] = useState<CardId[]>(v.hand);
  useEffect(() => {
    setOrder((prev) => {
      const keep = prev.filter((c) => v.hand.includes(c));
      return [...keep, ...v.hand.filter((c) => !keep.includes(c))];
    });
  }, [v.hand]);
  const arrange = (o: CardId[]) => {
    setOrder(o);
    act("arrange", { order: o });
  };

  const [selected, setSelected] = useState<Set<CardId>>(new Set());
  useEffect(() => {
    setSelected((s) => {
      const next = new Set([...s].filter((c) => v.hand.includes(c)));
      return next.size === s.size ? s : next;
    });
  }, [v.hand]);
  const toggle = (id: CardId) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const [sortMode, setSortMode] = useState<"suit" | "rank">("suit");
  const [menu, setMenu] = useState(false);
  const [scores, setScores] = useState(false);
  const [resultOpen, setResultOpen] = useState(true);

  // Sounds and haptics on what changed.
  const prev = useRef(v);
  useEffect(() => {
    const p = prev.current;
    prev.current = v;
    if (v.status === "playing" && (p.turn !== v.turn || p.status !== "playing") && h.myTurn) sfx.turn();
    else if (p.discardTop !== v.discardTop || p.stockCount !== v.stockCount) sfx.card();
    const seenCount = (x: TableView) => x.seats.filter((s) => s.seen).length;
    if (seenCount(v) > seenCount(p)) sfx.show();
    if (p.status === "playing" && v.status !== "playing" && v.reveal) {
      v.reveal.winnerId === v.you ? sfx.win() : sfx.lose();
      setResultOpen(true);
    }
  }, [v, h.myTurn]);

  const now = useNow(!!v.deadline && playing);
  const progress = v.deadline && v.settings.turnTimer ? Math.max(0, Math.min(1, (v.deadline - now) / (v.settings.turnTimer * 1000))) : null;
  const secondsLeft = v.deadline ? Math.max(0, Math.ceil((v.deadline - now) / 1000)) : null;

  // Opponents in turn order, starting after me.
  const others = useMemo(() => {
    const n = v.seats.length;
    const start = seated ? h.myIndex : -1;
    return Array.from({ length: n }, (_, i) => (start + 1 + i) % n).filter((i) => i !== h.myIndex);
  }, [v.seats.length, h.myIndex, seated]);

  const canDraw = h.myTurn && v.phase === "draw";
  const discardPhase = h.myTurn && v.phase === "discard";
  const one = selected.size === 1 ? [...selected][0] : null;
  const turnName = v.seats[v.turn]?.name;

  let hint = "";
  if (!playing) hint = v.status === "matchEnd" ? "Match over" : "Round over";
  else if (!seated) hint = `You're watching — you'll be dealt in next round. ${turnName}'s turn.`;
  else if (canDraw) hint = h.seen || !v.settings.restrictPickup ? "Your turn — draw from the stock or the discard pile" : "Your turn — draw a card (discard only if it completes a pure set)";
  else if (discardPhase) hint = h.canDeclare ? "You can finish! Tap Declare" : h.canShowPure || h.canShowDublee ? "You can show and see the maal" : "Throw a card — tap one, then Discard (or flick it up)";
  else hint = `${turnName} is playing…`;

  const discard = (c: CardId) => run("discard", { card: c });
  const show = (route: "pure" | "dublee") => run("show", { route, cards: selected.size === (route === "pure" ? 9 : 14) ? [...selected] : [] }).then((ok) => ok && setSelected(new Set()));
  const declare = () => run("declare", { discard: one ?? h.finishDiscard });

  const myTotal = seated ? totals(v)[v.you] ?? 0 : 0;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#06110d]">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 px-2 sm:px-4">
        <Button size="icon" variant="ghost" onClick={() => setMenu(true)} aria-label="Menu">
          <Menu />
        </Button>
        <button
          onClick={() => setScores(true)}
          className="flex items-center gap-2 rounded-full border border-gold/40 bg-black/30 px-3 py-1.5 text-xs font-bold sm:text-sm"
          data-testid="score-pill"
        >
          <BarChart3 className="h-4 w-4 text-gold" />
          {roundLabel(v)} · You <span className={cn(myTotal > 0 && "text-emerald-400", myTotal < 0 && "text-red-400")}>{signed(myTotal)}</span>
        </button>
        <div className="flex-1" />
        {!connected && (
          <span className="flex items-center gap-1 rounded-full bg-destructive/20 px-2.5 py-1 text-xs font-semibold text-red-200">
            <WifiOff className="h-3.5 w-3.5" /> Reconnecting…
          </span>
        )}
        {h.myTurn && secondsLeft != null && (
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold tabular-nums", secondsLeft <= 10 ? "bg-destructive/25 text-red-200" : "bg-black/30 text-gold")}>
            {secondsLeft}s
          </span>
        )}
        <span className="rounded-full bg-black/30 px-2.5 py-1 text-xs font-bold tracking-[0.2em] text-muted-foreground">{v.code}</span>
      </header>

      {/* Felt */}
      <div className="relative min-h-0 flex-1 px-2 sm:px-6">
        <div className="felt absolute inset-x-2 bottom-1 top-1 rounded-[50%/42%] sm:inset-x-6" />
        {others.map((idx, k) => {
          const spot = SPOTS[others.length]?.[k] ?? [50, 10];
          return (
            <div key={v.seats[idx].id} className="absolute z-10 -translate-x-1/2" style={{ left: `${spot[0]}%`, top: `${spot[1]}%` }}>
              <Seat
                seat={v.seats[idx]}
                active={playing && v.turn === idx}
                dealer={v.dealer === idx}
                progress={progress}
                maal={v.maal}
                compact={!landscape && vp.h < 700}
              />
            </div>
          );
        })}
        <div className="absolute inset-x-0 top-[48%] z-10 flex -translate-y-1/2 flex-col items-center gap-3">
          <div
            className={cn(
              "max-w-[92%] rounded-full px-4 py-1.5 text-center text-xs font-semibold shadow sm:text-sm",
              h.myTurn ? "bg-black/55 text-gold" : "bg-black/35 text-white/80",
            )}
            data-testid="hint"
          >
            {hint}
          </div>
          <Piles
            cw={pileCw}
            stockCount={v.stockCount}
            discardTop={v.discardTop}
            discardUnder={v.discardRecent.length > 1 ? v.discardRecent[v.discardRecent.length - 2] : null}
            maal={v.maal}
            maalHidden={v.maalHidden}
            canDraw={canDraw}
            onDraw={(from) => run("draw", { from })}
          />
        </div>
      </div>

      {/* My area */}
      {seated && (
        <div className="safe-pb shrink-0 px-2 pb-1 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 py-1.5">
            <div className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", h.myTurn ? "bg-gold text-[#2a1d00]" : "bg-black/40")}>
              {me?.name}
              {v.dealer === h.myIndex && <span className="rounded-full bg-white px-1 text-[9px] text-[#0b2a1f]">D</span>}
            </div>
            {!h.seen ? (
              <span className="rounded-full border border-gold/40 px-2.5 py-1 text-xs font-bold text-gold" data-testid="pure-count">
                Pure {Math.min(3, h.pureSets.length)}/3{h.dubleeOk ? ` · Dublee ${Math.min(7, h.dublees.length)}/7` : ""}
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full border border-emerald-400/40 px-2.5 py-1 text-xs font-bold text-emerald-300">
                <Eye className="h-3.5 w-3.5" /> Seen{h.seen === "dublee" ? " · dublees" : ""}
              </span>
            )}
            {me && me.shown.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto">
                {me.shown.map((g, i) => (
                  <div key={i} className="flex rounded bg-black/30 p-[2px]">
                    {g.map((c, j) => (
                      <PlayingCard key={c} id={c} width={20} maal={v.maal} style={{ marginLeft: j ? -8 : 0 }} />
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const next = sortMode === "suit" ? "rank" : "suit";
                  setSortMode(next);
                  arrange(next === "suit" ? sortBySuit(order) : sortByRank(order));
                }}
                aria-label="Sort cards"
              >
                <ArrowDownUp /> <span className="hidden sm:inline">Sort</span>
              </Button>
              <Button size="sm" variant="secondary" onClick={() => arrange(groupedOrder({ ...v, hand: order }, h))} aria-label="Group sets">
                <Layers /> <span className="hidden sm:inline">Group</span>
              </Button>
              {discardPhase && !h.seen && (h.canShowPure || selected.size === 9) && (
                <Button size="sm" variant="felt" className="ring-1 ring-gold/60" onClick={() => show("pure")} data-testid="show-pure">
                  <Sparkles /> Show 3 pure
                </Button>
              )}
              {discardPhase && !h.seen && h.canShowDublee && (
                <Button size="sm" variant="felt" className="ring-1 ring-gold/60" onClick={() => show("dublee")} data-testid="show-dublee">
                  <Sparkles /> Show 7 dublees
                </Button>
              )}
              {discardPhase && h.seen && (
                <Button size="sm" variant={h.canDeclare ? "gold" : "secondary"} onClick={declare} disabled={!h.canDeclare} data-testid="declare">
                  <Trophy /> Declare
                </Button>
              )}
              {discardPhase && (
                <Button size="sm" variant="gold" disabled={!one || one === v.picked} onClick={() => one && discard(one)} data-testid="discard-btn">
                  Discard
                </Button>
              )}
            </div>
          </div>
          <Hand
            cards={order}
            maal={v.maal}
            selected={selected}
            drawn={v.drawn}
            cardWidth={handCw}
            onToggle={toggle}
            onReorder={arrange}
            onSwipeUp={discardPhase ? (c) => discard(c) : undefined}
          />
        </div>
      )}

      {v.reveal && !playing && (
        <RoundResult view={v} open={resultOpen} onOpenChange={setResultOpen} onScores={() => setScores(true)} />
      )}
      {!playing && !resultOpen && (
        <div className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
          <Button variant="gold" size="lg" onClick={() => setResultOpen(true)}>
            <Trophy /> Round results
          </Button>
        </div>
      )}
      <ScoreSheet view={v} open={scores} onOpenChange={setScores} />
      <MenuSheet view={v} open={menu} onOpenChange={setMenu} onScores={() => setScores(true)} />
    </div>
  );
}
