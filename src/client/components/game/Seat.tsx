import { useMemo } from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SeatView } from "../../../shared/protocol";
import { Avatar } from "./Avatar";
import { PlayingCard } from "./PlayingCard";
import { useTheme } from "@/lib/themes";

interface Props {
  seat: SeatView;
  active: boolean;
  dealer: boolean;
  progress: number | null;
  maal: string | null;
  size?: number;
  showSets?: boolean;
  /** Put the card fan on the left (for seats near the right edge). */
  fanLeft?: boolean;
  /** Name beside the avatar instead of below (saves height on short screens). */
  inline?: boolean;
  /** Which way the shown sets extend, so they stay on the table. */
  align?: "left" | "center" | "right";
}

/** An opponent on the rim of the table: avatar, a fan of their face-down cards, name and status. */
export function Seat({ seat, active, dealer, progress, maal, size = 46, showSets = true, fanLeft, inline, align = "center" }: Props) {
  const theme = useTheme();
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
      <div className="relative">
        <Avatar
          name={seat.name}
          index={seat.avatar}
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
      </div>
      <div
        className={cn(
          !inline && "mt-1.5",
          "flex max-w-[120px] items-center gap-1 rounded-full px-2.5 py-[3px] text-xs font-bold shadow transition-colors",
          active ? "bg-gradient-to-b from-[#f7c45a] to-[#eba52a] text-[#2a1d00]" : "bg-[#0b1713]/80 text-white ring-1 ring-white/10",
        )}
      >
        <span className="truncate">{seat.name}</span>
        {seat.seen && <Eye className="h-3 w-3 shrink-0" aria-label={seat.seen === "dublee" ? "Seen with dublees" : "Seen the maal"} />}
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
            <div key={i} className="flex rounded-[4px] bg-black/30 p-[2px]">
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
