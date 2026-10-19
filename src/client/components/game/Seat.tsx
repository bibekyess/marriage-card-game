import { Eye, Layers } from "lucide-react";
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
  compact?: boolean;
}

/** An opponent around the table: avatar, name, cards held, and whether they've seen the maal. */
export function Seat({ seat, active, dealer, progress, maal, compact }: Props) {
  const size = compact ? 38 : 46;
  return (
    <div className={cn("flex flex-col items-center gap-1", !seat.connected && "opacity-80")} data-testid="seat">
      <div className="relative">
        <Avatar name={seat.name} index={seat.avatar} size={size} isBot={seat.isBot || seat.autoplay} offline={!seat.connected} active={active} progress={active ? progress : null} />
        {dealer && (
          <span className="absolute -left-1.5 -top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-[10px] font-extrabold text-[#0b2a1f] shadow ring-2 ring-background" title="Dealer">
            D
          </span>
        )}
        <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-[#0b1713] px-1.5 py-[1px] text-[10px] font-bold tabular-nums text-foreground/90 ring-1 ring-white/10">
          <Layers className="h-2.5 w-2.5 opacity-70" />
          {seat.cardCount}
        </span>
      </div>
      <div
        className={cn(
          "mt-1 flex max-w-[110px] items-center gap-1 rounded-full px-2 py-[2px] text-xs font-bold",
          active ? "bg-gold text-[#2a1d00]" : "bg-black/35 text-foreground",
        )}
      >
        <span className="truncate">{seat.name}</span>
        {seat.seen && <Eye className="h-3 w-3 shrink-0" aria-label={seat.seen === "dublee" ? "Seen with dublees" : "Seen the maal"} />}
      </div>
      {seat.shown.length > 0 && !compact && (
        <div className="flex max-w-[150px] flex-wrap justify-center gap-[3px]" aria-label={`${seat.name}'s shown sets`}>
          {seat.shown.map((g, i) => (
            <div key={i} className="flex rounded-[3px] bg-black/25 p-[2px]">
              {g.map((c, j) => (
                <PlayingCard key={c} id={c} width={15} maal={maal} style={{ marginLeft: j ? -6 : 0 }} className="!shadow-none" />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
