import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TableView } from "../../../shared/protocol";
import { CardId, cardLabel } from "../../../shared/cards";
import { recentPicks } from "@/lib/activity";
import { Avatar } from "./Avatar";
import { PlayingCard } from "./PlayingCard";

interface Props {
  view: TableView;
  /** The player whose seat was tapped (highlighted and scrolled to); null = closed. */
  focus: string | null;
  onClose: () => void;
}

/** Every card each player has thrown this round, oldest first, and their last two picks. Picked-up cards are dimmed. */
export function ThrownDialog({ view: v, focus, onClose }: Props) {
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) requestAnimationFrame(() => focusRef.current?.scrollIntoView({ block: "nearest" }));
  }, [focus]);
  return (
    <Dialog open={!!focus} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-3 p-4 sm:max-w-xl sm:p-5" data-testid="thrown-dialog">
        <DialogHeader>
          <DialogTitle>Thrown cards</DialogTitle>
          <DialogDescription>Oldest first. Faded cards were picked up, or have left the hand.</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
          {v.seats.map((s) => {
            const thrown = s.thrown ?? [];
            const picks = recentPicks(v.plays ?? [], v.round, s.id);
            // A pick they've since thrown or shown is no longer in their hand.
            const gone = (c: CardId) => thrown.some((t) => t.card === c) || s.shown.some((set) => set.includes(c));
            return (
              <div
                key={s.id}
                ref={s.id === focus ? focusRef : undefined}
                className={cn("flex items-center gap-3 px-3 py-2", s.id === focus && "bg-gold/10")}
                data-testid="thrown-row"
              >
                <div className="flex w-20 shrink-0 items-center gap-2 sm:w-28">
                  <Avatar name={s.name} index={s.avatar} look={s.look} size={26} isBot={s.isBot} />
                  <span className="truncate text-xs font-bold">{s.id === v.you ? "You" : s.name}</span>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  {thrown.length ? (
                    <div className="flex min-w-0 flex-wrap gap-1">
                      {thrown.map((t, i) => (
                        <div key={i} className="relative" title={`${cardLabel(t.card)}${t.taken ? " (picked up)" : ""}`}>
                          <PlayingCard id={t.card} width={26} maal={v.maal} dim={t.taken} className="!shadow-none" />
                          {t.taken && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[#0b1713] px-1 text-[8px] font-bold leading-3 text-gold ring-1 ring-gold/40">
                              taken
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-white/50">Nothing thrown yet</span>
                  )}
                  {picks.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-gold">Picked</span>
                      {picks.map((c, i) => (
                        <div key={i} title={`Picked up ${cardLabel(c)}${gone(c) ? " (no longer held)" : ""}`}>
                          <PlayingCard id={c} width={26} maal={v.maal} dim={gone(c)} className="!shadow-none" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
