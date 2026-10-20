import { Fragment } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { describePlay, playKey } from "@/lib/activity";
import { nameOf } from "@/lib/format";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { TableView } from "../../../shared/protocol";
import { Avatar } from "./Avatar";
import { PlayingCard } from "./PlayingCard";

/** Every move this match, newest first, with a divider at each round. */
function ActivityList({ view: v }: { view: TableView }) {
  const plays = [...(v.plays ?? [])].reverse();
  if (!plays.length) return <p className="px-3 py-4 text-center text-xs text-white/50">No moves yet.</p>;
  return (
    <ol className="flex flex-col" data-testid="activity-list">
      {plays.map((p, i) => {
        const { text, mine } = describePlay(v, p);
        const seat = v.seats.find((s) => s.id === p.by);
        const roundStart = i === plays.length - 1 || plays[i + 1].round !== p.round;
        return (
          <Fragment key={playKey(p) + i}>
            <li
              className={cn(
                "flex items-center gap-2 px-2.5 py-1.5 text-xs leading-tight",
                mine && "bg-gold/10 text-gold",
                p.kind === "win" && "font-bold text-gold",
              )}
              data-testid="activity-item"
            >
              <Avatar name={nameOf(v, p.by)} index={seat?.avatar ?? 0} size={20} />
              <span className="min-w-0 flex-1">{text}</span>
              {p.card && <PlayingCard id={p.card} width={20} maal={v.maal} dim={p.kind === "stock"} className="shrink-0 !shadow-none" />}
            </li>
            {roundStart && (
              <li className="flex items-center gap-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white/40" aria-label={`Round ${p.round}`}>
                <span className="h-px flex-1 bg-white/10" />
                Round {p.round}
                <span className="h-px flex-1 bg-white/10" />
              </li>
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}

/** Always-there column on the right of the table (desktop). */
export function ActivityPanel({ view, onClose }: { view: TableView; onClose(): void }) {
  return (
    <aside className="relative z-10 my-2 mr-2 flex w-64 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/55 backdrop-blur-sm" data-testid="activity-panel">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-gold">Activity</h2>
        <button type="button" onClick={onClose} className="rounded p-0.5 text-white/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold" aria-label="Close activity">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        <ActivityList view={view} />
      </div>
    </aside>
  );
}

/** The same log as a slide-in sheet, for phones. */
export function ActivitySheet({ view, open, onOpenChange }: { view: TableView; open: boolean; onOpenChange(o: boolean): void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-72 max-w-[85vw] flex-col gap-2 p-0 pt-4" data-testid="activity-sheet">
        <SheetHeader className="px-4">
          <SheetTitle>Activity</SheetTitle>
          <SheetDescription className="text-xs">Newest first. Gold lines are about cards you threw.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <ActivityList view={view} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
