import { useMemo } from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SeatView } from "../../../shared/protocol";
import { Avatar } from "./Avatar";
import { PlayingCard } from "./PlayingCard";
import { TunnelTag } from "./TunnelTag";
import { useTheme } from "@/lib/themes";
import { clock, turnPace } from "@/lib/format";

interface Props {
  seat: SeatView;
  active: boolean;
  dealer: boolean;
  progress: number | null;
  /** Seconds this player has spent on the current turn (only while it's their turn). */
  elapsed?: number | null;
  maal: string | null;
  size?: number;
  showSets?: boolean;
  /** Put the card fan on the left (for seats near the right edge). */
  fanLeft?: boolean;
  /** Name beside the avatar instead of below (saves height on short screens). */
  inline?: boolean;
  /** Which way the shown sets extend, so they stay on the table. */
  align?: "left" | "center" | "right";
  /** Tapping the avatar opens the thrown-cards list. */
  onOpen?: () => void;
}

/** An opponent on the rim of the table: avatar, a fan of their face-down cards, name and status. */
/** How long the player has been on this turn; turns amber, then red, when they're slow. */
export function TurnClock({ seconds, className }: { seconds: number; className?: string }) {
  const pace = turnPace(seconds);
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1 text-[10px] font-extrabold tabular-nums leading-4",
        pace === "ok" && "opacity-70",
        pace === "slow" && "bg-[#2a1d00] text-amber-300",
        pace === "very-slow" && "bg-red-600 text-white motion-safe:animate-pulse",
        className,
      )}
      title="Time on this turn"
      aria-label={`On this turn for ${clock(seconds)}`}
      data-testid="turn-clock"
    >
      {clock(seconds)}
    </span>
  );
}

export function Seat({ seat, active, dealer, progress, elapsed = null, maal, size = 46, showSets = true, fanLeft, inline, align = "center", onOpen }: Props) {
  const theme = useTheme();
  // Older cached views may not have `thrown` yet.
  const last = seat.thrown?.at(-1);
  const lastCw = Math.max(16, Math.round(size * 0.36));
  const fan = Math.min(5, Math.max(1, Math.round(seat.cardCount / 5)));
  const setCw = Math.max(16, Math.round(size * 0.4));
  // Built once per size, so the memoised card backs don't re-render on every table update.
  const fanCards = useMemo(
    () =>
      Array.from({ length: fan }, (_, i) => (
        <PlayingCard
          key={i}
          width={Math.round(size * 0.34)}
          className="!border !shadow-sm"
          style={{ [fanLeft ? "marginRight" : "marginLeft"]: i ? -Math.round(size * 0.26) : 0, transform: `rotate(${(i - (fan - 1) / 2) * 9}deg)`, transformOrigin: "bottom center" }}
        />
      )),
    [fan, size, fanLeft],
  );
  return (
    <div className={cn("relative flex items-center", inline ? "flex-row gap-6" : "flex-col")} data-testid="seat" data-active={active || undefined}>
      <button
        type="button"
        className="relative block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        onClick={onOpen}
        aria-label={`${seat.name}: see thrown cards`}
        data-testid="seat-open"
      >
        <Avatar
          name={seat.name}
          index={seat.avatar}
          look={seat.look}
          size={size}
          isBot={seat.isBot || seat.autoplay}
          offline={!seat.connected}
          active={active}
          progress={active ? progress : null}
          tika={theme === "royal" || theme === "kite"}
          badge={theme === "kite" ? "kite" : null}
        />
        {dealer && (
          <span className="absolute -left-1 -top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-[10px] font-extrabold text-[#0b2a1f] shadow ring-2 ring-[#0b2a1f]" title="Dealer">
            D
          </span>
        )}
        {/* Face-down fan with the card count (hidden between rounds) */}
        {seat.cardCount > 0 && (
        <div className={cn("absolute bottom-0 flex items-end", fanLeft ? "-left-5 flex-row-reverse" : "-right-5")} aria-label={`${seat.cardCount} cards`}>
          {fanCards}
          <span className={cn("absolute -bottom-1 rounded-full", fanLeft ? "-left-2" : "-right-2", " bg-[#0b1713] px-1.5 text-[10px] font-bold tabular-nums leading-4 text-white ring-1 ring-white/15")}>{seat.cardCount}</span>
        </div>
        )}
        {/* Their last throw, face up on the other side of the avatar */}
        {last && (
          <div
            className={cn("pointer-events-none absolute bottom-0", fanLeft ? "-right-4" : "-left-4")}
            style={{ transform: `rotate(${fanLeft ? 8 : -8}deg)` }}
            data-testid="seat-last-thrown"
          >
            <PlayingCard id={last.card} width={lastCw} maal={maal} dim={last.taken} className="!shadow-sm" />
          </div>
        )}
      </button>
      <div
        className={cn(
          !inline && "mt-1.5",
          "flex max-w-[120px] items-center gap-1 rounded-full px-2.5 py-[3px] text-xs font-bold shadow transition-colors",
          active ? "bg-gradient-to-b from-[#f7c45a] to-[#eba52a] text-[#2a1d00]" : "bg-[#0b1713]/80 text-white ring-1 ring-white/10",
        )}
      >
        <span className="truncate">{seat.name}</span>
        {seat.seen && <Eye className="h-3 w-3 shrink-0" aria-label={seat.seen === "dublee" ? "Seen with dublees" : "Seen the maal"} />}
        {elapsed != null && <TurnClock seconds={elapsed} />}
      </div>
      {showSets && seat.shown.length > 0 && (
        <div
          className={cn(
            "absolute top-full mt-1 flex w-max flex-nowrap gap-[3px]",
            inline ? "left-full top-0 ml-3 mt-0" : align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2",
          )}
          aria-label={`${seat.name}'s shown sets`}
        >
          {seat.shown.map((g, i) => (
            <div key={i} className="relative flex rounded-[4px] bg-black/30 p-[2px]">
              {i < (seat.tunnels ?? 0) && <TunnelTag size={Math.max(12, Math.round(setCw * 0.7))} />}
              {g.map((c, j) => (
                <PlayingCard key={c} id={c} width={setCw} maal={maal} style={{ marginLeft: j ? -Math.round(setCw * 0.42) : 0 }} className="!shadow-none" />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
