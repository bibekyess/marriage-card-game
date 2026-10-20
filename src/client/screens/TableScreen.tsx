import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, ArrowUp, BarChart3, Eye, Layers, Menu, Sparkles, Trophy, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Hand } from "@/components/game/Hand";
import { Piles } from "@/components/game/Piles";
import { Seat } from "@/components/game/Seat";
import { PlayingCard } from "@/components/game/PlayingCard";
import { Avatar } from "@/components/game/Avatar";
import { FeltPattern, TableDecor, THEME_FELT } from "@/components/theme/decor";
import { useTheme } from "@/lib/themes";
import { computeHints, groupedOrder } from "@/lib/hints";
import { nameOf, roundLabel, signed, totals } from "@/lib/format";
import { act } from "@/lib/store";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { RoundResult } from "./RoundResult";
import { ScoreSheet } from "./ScoreSheet";
import { MenuSheet } from "./MenuSheet";
import { CardId, cardLabel, sortByRank, sortBySuit } from "../../shared/cards";
import type { TableView } from "../../shared/protocol";
import { MAX_PLAYERS } from "../../shared/settings";

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
const SPOTS_PORTRAIT: Record<number, [number, number][]> = {
  1: [[50, 0]],
  2: [[16, 18], [84, 18]],
  3: [[15, 22], [50, 0], [85, 22]],
  4: [[14, 26], [32, 0], [68, 0], [86, 26]],
  5: [[14, 40], [16, 8], [50, 0], [84, 8], [86, 40]],
};
const SPOTS: Record<number, [number, number][]> = {
  1: [[50, 0]],
  2: [[9, 26], [91, 26]],
  3: [[8, 30], [50, 0], [92, 30]],
  4: [[7, 34], [30, 0], [70, 0], [93, 34]],
  5: [[7, 48], [22, 2], [50, 0], [78, 2], [93, 48]],
};

export function TableScreen({ view: v, connected }: { view: TableView; connected: boolean }) {
  const vp = useViewport();
  const theme = useTheme();
  // Royal & Kite use a warm marigold turn colour; Classic & Glow keep gold.
  const festive = theme === "royal" || theme === "kite";
  const turnGrad = festive ? "from-[#ffcf4a] to-[#ff8a1f]" : "from-[#ffd77a] to-[#e9a224]";
  // Over decorations, header chips need an opaque base (and no backdrop blur over moving bokeh).
  const chipBg = theme === "classic" ? "bg-black/45 backdrop-blur-sm" : "bg-black/75";
  // Kite festival: amber, gold-bordered tool buttons.
  const toolBtn = theme === "kite" ? "bg-[#ffb347]/20 text-[#ffd36e] ring-1 ring-[#ffb347]/60 hover:bg-[#ffb347]/30" : "";
  const landscape = vp.w > vp.h;
  const h = useMemo(() => computeHints(v), [v]);
  const me = v.seats[h.myIndex];
  const seated = h.myIndex >= 0;
  const playing = v.status === "playing";

  // Card sizes follow the screen.
  const handCw = Math.round(landscape ? Math.min(vp.h * 0.17, vp.w * 0.062, vp.h >= 800 ? 100 : 84) : Math.min(vp.w * 0.14, 62));
  const pileCw = Math.round(landscape ? Math.min(vp.h * 0.145, vp.w >= 1100 ? 120 : 76) : Math.min(vp.w * 0.16, 68));

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

  const [sortMode, setSortMode] = useState<"suit" | "rank">("rank"); // first tap sorts by suit
  const [menu, setMenu] = useState(false);
  const [scores, setScores] = useState(false);
  const [resultOpen, setResultOpen] = useState(true);
  const [turnFlash, setTurnFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // Sounds and haptics on what changed.
  const prev = useRef(v);
  useEffect(() => {
    const p = prev.current;
    prev.current = v;
    if (v.status === "playing" && (p.turn !== v.turn || p.status !== "playing") && h.myTurn) {
      sfx.turn();
      if (!me?.autoplay) {
        setTurnFlash(true);
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setTurnFlash(false), 1300);
      }
    } else if (p.discardTop !== v.discardTop || p.stockCount !== v.stockCount) sfx.card();

    const seenCount = (x: TableView) => x.seats.filter((s) => s.seen).length;
    if (seenCount(v) > seenCount(p)) sfx.show();
    if (p.status === "playing" && v.status !== "playing" && v.reveal) {
      if (v.reveal.winnerId === v.you) sfx.win();
      else if (v.reveal.winnerId) sfx.lose();
      setResultOpen(true);
    }
  }, [v, h.myTurn]);

  // Count down against the server's clock, not the phone's (which may be off).
  const offset = useMemo(() => v.serverNow - Date.now(), [v.serverNow]);
  const now = useNow(!!v.deadline && playing) + offset;
  const progress = v.deadline && v.settings.turnTimer ? Math.max(0, Math.min(1, (v.deadline - now) / (v.settings.turnTimer * 1000))) : null;
  const secondsLeft = v.deadline ? Math.max(0, Math.ceil((v.deadline - now) / 1000)) : null;

  // Opponents in turn order, starting after me.
  const others = useMemo(() => {
    const n = v.seats.length;
    const start = seated ? h.myIndex : -1;
    return Array.from({ length: n }, (_, i) => (start + 1 + i) % n).filter((i) => i !== h.myIndex);
  }, [v.seats.length, h.myIndex, seated]);

  // While showing the cached table after a refresh (or offline), wait for the live state before acting.
  const canDraw = connected && h.myTurn && v.phase === "draw";
  const discardPhase = connected && h.myTurn && v.phase === "discard";
  const one = selected.size === 1 ? [...selected][0] : null;
  const turnName = v.seats[v.turn]?.name;

  let hint = "";
  if (!playing) hint = v.status === "matchEnd" ? "Match over" : "Round over";
  else if (!seated)
    hint = `You're watching${v.seats.length >= MAX_PLAYERS ? " — the table is full" : " — you'll be dealt in next round"}. ${turnName}'s turn.`;
  else if (me?.autoplay) hint = "A bot is playing for you — open the menu to take back control";
  else if (canDraw && v.canOpenTunnels) hint = "You can show your tunnela before drawing";
  else if (canDraw && (h.canShowPure || h.canShowDublee)) hint = "You can show and see the maal, or draw";
  else if (canDraw) hint = h.canPickDiscard ? "Your turn — draw from the stock or take the discard" : "Your turn — draw from the stock";
  else if (discardPhase) hint = h.canDeclare ? "You can finish — tap Declare!" : h.canShowPure || h.canShowDublee ? "You can show and see the maal" : "Pick a card to throw";
  else hint = `${turnName} is playing…`;

  const discard = (c: CardId) => run("discard", { card: c });
  const show = (route: "pure" | "dublee") => run("show", { route, cards: selected.size === (route === "pure" ? h.setsNeeded * 3 : 14) ? [...selected] : [] }).then((ok) => ok && setSelected(new Set()));
  const declare = () => run("declare", { discard: one ?? h.finishDiscard });

  const myTotal = seated ? totals(v)[v.you] ?? 0 : 0;

  const wide = vp.w >= 700;
  // Short landscape phones have no room on the felt for the "Your turn" pill; the hint flashes instead.
  const shortScreen = landscape && vp.h < 600;
  const seatSize = Math.round(landscape ? Math.min(Math.max(vp.h * 0.1, 34), vp.w >= 1100 ? 66 : 56) : Math.min(vp.w * 0.11, 48));
  const hintPill = (
    <div
      className={cn(
        "line-clamp-2 rounded-full px-4 py-1.5 text-center text-xs font-semibold leading-snug sm:text-sm",
        turnFlash && shortScreen
          ? cn("bg-gradient-to-b font-extrabold text-[#2a1d00] transition-colors", turnGrad)
          : h.myTurn
            ? festive
              ? "bg-[#2a0f06]/90 text-[#ffd36e] ring-1 ring-[#ffb347]/70 transition-colors"
              : theme === "glow"
                ? "bg-[#0b1a12]/90 text-gold ring-1 ring-gold/50 transition-colors"
                : "bg-gold/15 text-gold ring-1 ring-gold/40 transition-colors"
            : theme === "classic"
              ? "bg-black/45 text-white/80 backdrop-blur-sm"
              : "bg-black/75 text-white/85",
      )}
      data-testid="hint"
    >
      {hint}
    </div>
  );

  const btn = vp.w < 520 ? "default" : "lg";
  const primary = discardPhase || canDraw ? (
    canDraw && v.canOpenTunnels ? (
      <Button size={btn} variant="gold" onClick={() => run("openTunnels")} data-testid="open-tunnels">
        <Sparkles /> Show tunnela
      </Button>
    ) : discardPhase && h.canDeclare ? (
      <Button size={btn} variant="gold" onClick={declare} data-testid="declare" className="animate-pulse-ring">
        <Trophy /> Declare
      </Button>
    ) : !h.seen && (h.canShowPure || selected.size === h.setsNeeded * 3) ? (
      <Button size={btn} variant="gold" onClick={() => show("pure")} data-testid="show-pure">
        <Sparkles /> {vp.w < 520 ? "Show" : `Show ${h.setsNeeded} pure`}
      </Button>
    ) : !h.seen && h.canShowDublee ? (
      <Button size={btn} variant="gold" onClick={() => show("dublee")} data-testid="show-dublee">
        <Sparkles /> {vp.w < 520 ? "Show" : "Show 7 dublees"}
      </Button>
    ) : null
  ) : null;

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden" style={{ background: THEME_FELT[theme].page }}>
      <TableDecor theme={theme} />
      {/* Top bar */}
      <header className="relative z-10 flex h-12 shrink-0 items-center gap-2 px-2 sm:px-4">
        <Button size="icon" variant="ghost" className={cn(chipBg, "hover:bg-black/80")} onClick={() => setMenu(true)} aria-label="Menu">
          <Menu />
        </Button>
        <button
          onClick={() => setScores(true)}
          aria-label="Scoreboard"
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-full border border-gold/40 px-3 py-1.5 text-xs font-bold transition-colors hover:bg-black/80 sm:text-sm",
            theme === "classic" ? "bg-black/55 backdrop-blur-sm" : "bg-black/75",
          )}
          data-testid="score-pill"
        >
          <BarChart3 className="h-4 w-4 text-gold" />
          {theme === "royal" && <span className="-ml-1 h-2 w-1.5 rounded-full bg-[#d7192a] ring-1 ring-[#ffd36e]" aria-hidden />}
          <span className={cn(seated && "hidden min-[400px]:inline")}>{roundLabel(v)}</span>
          {seated && (
            <>
              <span className="hidden min-[400px]:inline">·</span> You{" "}
              <span className={cn("tabular-nums", myTotal > 0 && "text-emerald-400", myTotal < 0 && "text-red-400")}>{signed(myTotal)}</span>
            </>
          )}
        </button>
        <div className="flex min-w-0 flex-1 justify-center">{wide && hintPill}</div>
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
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tracking-[0.2em] text-white/75", chipBg)}>{v.code}</span>
      </header>

      {/* Felt with opponents on the rim */}
      <div className={cn("relative flex min-h-0 flex-1 px-3 pb-2 pt-1 sm:px-8", landscape ? "items-center" : "items-start pt-4")}>
        <div className="relative mx-auto h-full w-full max-w-[1100px]" style={{ maxHeight: landscape ? Math.max(240, (vp.w - 32) * 0.62) : (vp.w - 24) * 1.2 }}>
          <div
            className="felt absolute inset-x-0 overflow-hidden rounded-[50%/46%]"
            style={{
              top: seatSize * 0.55,
              bottom: 4,
              background: THEME_FELT[theme].felt,
              boxShadow: `inset 0 0 0 6px ${THEME_FELT[theme].rim}, inset 0 0 0 8px #c9a14a66, inset 0 10px 60px rgba(0,0,0,.45), 0 30px 60px -20px rgba(0,0,0,.8)`,
            }}
          >
            {/* On short landscape phones there's no room for the Glow greeting below the piles. */}
            <FeltPattern theme={theme} hideWatermark={shortScreen} />
          </div>
          {others.map((idx, k) => {
            const spot = (landscape ? SPOTS : SPOTS_PORTRAIT)[others.length]?.[k] ?? [50, 0];
            return (
              <div key={v.seats[idx].id} className="absolute z-10 -translate-x-1/2" style={{ left: `${spot[0]}%`, top: `${spot[1]}%` }}>
                <Seat
                  seat={v.seats[idx]}
                  active={playing && v.turn === idx}
                  dealer={v.dealer === idx}
                  progress={progress}
                  maal={v.maal}
                  size={seatSize}
                  showSets={landscape ? vp.h >= 380 : true}
                  fanLeft={spot[0] > 60}
                  align={spot[0] < 35 ? "left" : spot[0] > 65 ? "right" : "center"}
                  inline={landscape && vp.h < 520 && spot[1] < 10}
                />
              </div>
            );
          })}
          {turnFlash && !shortScreen && (
            <div className="pointer-events-none absolute inset-x-0 top-[26%] z-20 flex justify-center">
              <span className={cn("rounded-full bg-gradient-to-b px-5 py-1.5 text-sm font-extrabold text-[#2a1d00] shadow-lift motion-safe:animate-card-in", turnGrad)}>
                Your turn
              </span>
            </div>
          )}
          <div className="absolute inset-x-0 z-10 flex justify-center" style={{ top: "54%", transform: "translateY(-50%)" }}>
            <Piles
              cw={pileCw}
              stockCount={v.stockCount}
              discardTop={v.discardTop}
              discardUnder={v.discardRecent.length > 1 ? v.discardRecent[v.discardRecent.length - 2] : null}
              maal={v.maal ?? (!playing ? v.reveal?.maal ?? null : null)}
              maalHidden={v.maalHidden}
              canDraw={canDraw}
              canPickDiscard={canDraw && h.canPickDiscard}
              thrownBy={v.discardBy ? (v.discardBy === v.you ? "You" : nameOf(v, v.discardBy)) : null}
              onDraw={(from) => run("draw", { from })}
            />
          </div>
        </div>
      </div>

      {!wide && <div className="relative z-10 flex justify-center px-3 pb-1">{hintPill}</div>}

      {/* My dock + hand */}
      {seated && playing && (
        <div className="safe-pb relative z-20 shrink-0 px-2 pb-1 sm:px-8">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-2 pb-1.5">
            <div className={cn("flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-bold", h.myTurn ? "bg-gradient-to-b from-[#f7c45a] to-[#eba52a] text-[#2a1d00]" : "bg-black/40")}>
              <Avatar name={me?.name ?? "You"} index={me?.avatar ?? 0} size={22} tika={festive} />
              {me?.name}
              {v.dealer === h.myIndex && <span className="rounded-full bg-white px-1 text-[9px] text-[#0b2a1f]">D</span>}
            </div>
            {!h.seen ? (
              <span className="rounded-full border border-gold/40 bg-black/20 px-2.5 py-1 text-xs font-bold text-gold" data-testid="pure-count">
                Pure {Math.min(3, h.pureSets.length)}/3{h.dubleeOk ? ` · Dublee ${Math.min(7, h.dublees.length)}/7` : ""}
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full border border-emerald-400/40 bg-black/20 px-2.5 py-1 text-xs font-bold text-emerald-300">
                <Eye className="h-3.5 w-3.5" /> Seen{h.seen === "dublee" ? " · dublees" : ""}
              </span>
            )}
            {me && me.shown.length > 0 && (
              <div className="flex max-w-[45vw] items-center gap-1 overflow-x-auto">
                {me.shown.map((g, i) => (
                  <div key={i} className="flex shrink-0 rounded bg-black/30 p-[2px]">
                    {g.map((c, j) => (
                      <PlayingCard key={c} id={c} width={20} maal={v.maal} style={{ marginLeft: j ? -8 : 0 }} />
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                size="icon"
                variant="secondary"
                className={cn("h-9 w-9", toolBtn)}
                onClick={() => {
                  const next = sortMode === "suit" ? "rank" : "suit";
                  setSortMode(next);
                  arrange(next === "suit" ? sortBySuit(order) : sortByRank(order));
                }}
                aria-label={`Sort by ${sortMode === "suit" ? "rank" : "suit"}`}
                title="Sort"
              >
                <ArrowDownUp />
              </Button>
              <Button size="icon" variant="secondary" className={cn("h-9 w-9", toolBtn)} onClick={() => arrange(groupedOrder({ ...v, hand: order }, h))} aria-label="Group sets" title="Group sets">
                <Layers />
              </Button>
              {primary}
              {discardPhase &&
                (!one || one === v.picked ? (
                  <Button size={btn} variant="outline" className="border-gold/50 text-gold/90 disabled:opacity-80" disabled data-testid="discard-btn">
                    {one === v.picked && one ? "Can't throw back" : "Select a card"}
                  </Button>
                ) : (
                  <Button size={btn} variant={primary ? "felt" : "gold"} onClick={() => discard(one)} data-testid="discard-btn">
                    <ArrowUp /> {vp.w >= 400 ? `Discard ${cardLabel(one)}` : "Discard"}
                  </Button>
                ))}
            </div>
          </div>
          <div className="mx-auto max-w-[1180px]">
            <Hand
              cards={order}
              maal={v.maal}
              selected={selected}
              drawn={v.drawn}
              cardWidth={handCw}
              onToggle={toggle}
              onReorder={arrange}
              onSwipeUp={discardPhase ? (c) => c !== v.picked && discard(c) : undefined}
              dealKey={`${v.code}:${v.round}`}
            />
          </div>
        </div>
      )}

      {v.reveal && !playing && (
        <RoundResult
          view={v}
          open={resultOpen}
          onOpenChange={setResultOpen}
          onScores={() => {
            setResultOpen(false);
            setScores(true);
          }}
        />
      )}
      {!playing && (!resultOpen || !v.reveal) && (
        <div className="safe-pb relative z-10 flex shrink-0 justify-center gap-2 px-3 pt-2">
          {v.reveal && (
            <Button variant="secondary" size="lg" onClick={() => setResultOpen(true)}>
              <Trophy /> Round results
            </Button>
          )}
          {v.status === "matchEnd" ? (
            <Button variant="gold" size="lg" onClick={() => setScores(true)} data-testid="settle-btn">
              <BarChart3 /> Settle up
            </Button>
          ) : (
            v.hostId === v.you && (
              <Button variant="gold" size="lg" onClick={() => run("start")}>
                Deal next round
              </Button>
            )
          )}
        </div>
      )}
      <ScoreSheet view={v} open={scores} onOpenChange={setScores} />
      <MenuSheet view={v} open={menu} onOpenChange={setMenu} onScores={() => setScores(true)} />
    </div>
  );
}
