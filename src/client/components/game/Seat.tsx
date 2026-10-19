import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SeatView } from "../../../shared/protocol";
import { Avatar } from "./Avatar";
import { PlayingCard } from "./PlayingCard";

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
}

/** An opponent on the rim of the table: avatar, a fan of their face-down cards, name and status. */
export function Seat({ seat, active, dealer, progress, maal, size = 46, showSets = true, fanLeft, inline }: Props) {
  const fan = Math.min(5, Math.max(1, Math.round(seat.cardCount / 5)));
  return (
    <div className={cn("flex items-center", inline ? "flex-row gap-6" : "flex-col")} data-testid="seat" data-active={active || undefined}>
      <div className="relative">
        <Avatar name={seat.name} index={seat.avatar} size={size} isBot={seat.isBot || seat.autoplay} offline={!seat.connected} active={active} progress={active ? progress : null} />
        {dealer && (
          <span className="absolute -left-1 -top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-[10px] font-extrabold text-[#0b2a1f] shadow ring-2 ring-[#0b2a1f]" title="Dealer">
            D
          </span>
        )}
        {/* Face-down fan with the card count */}
        <div className={cn("absolute bottom-0 flex items-end", fanLeft ? "-left-5 flex-row-reverse" : "-right-5")} aria-label={`${seat.cardCount} cards`}>
          {Array.from({ length: fan }, (_, i) => (
            <PlayingCard
              key={i}
              width={Math.round(size * 0.34)}
              className="!border !shadow-sm"
              style={{ [fanLeft ? "marginRight" : "marginLeft"]: i ? -Math.round(size * 0.26) : 0, transform: `rotate(${(i - (fan - 1) / 2) * 9}deg)`, transformOrigin: "bottom center" }}
            />
          ))}
          <span className={cn("absolute -bottom-1 rounded-full", fanLeft ? "-left-2" : "-right-2", " bg-[#0b1713] px-1.5 text-[10px] font-bold tabular-nums leading-4 text-white ring-1 ring-white/15")}>{seat.cardCount}</span>
        </div>
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
        <div className="mt-1 flex max-w-[170px] flex-wrap justify-center gap-[3px]" aria-label={`${seat.name}'s shown sets`}>
          {seat.shown.map((g, i) => (
            <div key={i} className="flex rounded-[4px] bg-black/30 p-[2px]">
              {g.map((c, j) => (
                <PlayingCard key={c} id={c} width={17} maal={maal} style={{ marginLeft: j ? -7 : 0 }} className="!shadow-none" />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
