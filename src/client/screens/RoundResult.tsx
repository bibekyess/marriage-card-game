import { BarChart3, Crown, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayingCard } from "@/components/game/PlayingCard";
import { Avatar } from "@/components/game/Avatar";
import { act } from "@/lib/store";
import { signed, totals } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TableView } from "../../shared/protocol";
import { cardLabel } from "../../shared/cards";

function Cards({ groups, loose, maal }: { groups: string[][]; loose: string[]; maal: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {groups.map((g, i) => (
        <div key={i} className="flex rounded-md bg-emerald-400/10 p-[3px] ring-1 ring-emerald-400/25">
          {g.map((c, j) => (
            <PlayingCard key={c} id={c} width={26} maal={maal} style={{ marginLeft: j ? -9 : 0 }} />
          ))}
        </div>
      ))}
      {loose.length > 0 && (
        <div className="flex p-[3px]">
          {loose.map((c, j) => (
            <PlayingCard key={c} id={c} width={26} maal={maal} style={{ marginLeft: j ? -11 : 0 }} />
          ))}
        </div>
      )}
    </div>
  );
}

export function RoundResult({ view: v, open, onOpenChange, onScores }: { view: TableView; open: boolean; onOpenChange(o: boolean): void; onScores(): void }) {
  const r = v.reveal!;
  const host = v.hostId === v.you;
  const name = (id: string) => v.seats.find((s) => s.id === id)?.name ?? "Player";
  const seat = (id: string) => v.seats.find((s) => s.id === id);
  const winner = name(r.winnerId);
  const t = totals(v);
  const last = v.status === "matchEnd";
  const rows = [...r.players].sort((a, b) => b.points - a.points);

  const next = async () => {
    const res = await act("start");
    if (!res.ok) toast.error(res.error ?? "Couldn't deal.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl" data-testid="round-result">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-b from-[#ffd36e] to-[#e9a224] text-[#2a1d00]">
              <Crown className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                {!r.winnerId ? "Round called off" : r.winnerId === v.you ? "You won" : `${winner} won`} · round {v.rounds[v.rounds.length - 1]?.round}
              </DialogTitle>
              <DialogDescription>
                {!r.winnerId
                  ? "The stock ran out too many times — no points this round."
                  : `${r.route === "dublee" ? "Finished with 8 dublees" : "Finished with complete sets"} · threw ${cardLabel(r.discard)} · maal was ${cardLabel(r.maal)}`}
              </DialogDescription>
            </div>
            <PlayingCard id={r.maal} width={40} maal={r.maal} className="ml-auto" />
          </div>
        </DialogHeader>

        <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
          {rows.map((p) => {
            const s = seat(p.id);
            return (
              <div key={p.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-[150px] items-center gap-2.5">
                  <Avatar name={name(p.id)} index={s?.avatar ?? 0} size={32} isBot={s?.isBot} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate text-sm font-bold">
                      {name(p.id)}
                      {p.id === r.winnerId && <Crown className="h-3.5 w-3.5 text-gold" />}
                    </div>
                    <div className="flex gap-1">
                      <Badge variant={p.seen ? "success" : "muted"} className="px-1.5 py-0 text-[10px]">
                        {p.seen ? "Seen" : "Unseen"}
                      </Badge>
                      {p.breakdown.marriages > 0 && <Badge variant="gold" className="px-1.5 py-0 text-[10px]">Marriage</Badge>}
                    </div>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <Cards groups={[...p.shown, ...p.groups]} loose={p.hand} maal={r.maal} />
                </div>
                <div className="flex shrink-0 items-center gap-4 text-right sm:w-[150px] sm:justify-end">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Maal</div>
                    <div className="text-sm font-bold tabular-nums">
                      {p.maal}
                      {p.rawMaal !== p.maal && !p.seen && <span className="ml-1 text-xs text-muted-foreground line-through">{p.rawMaal}</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Round</div>
                    <div className={cn("text-lg font-extrabold tabular-nums", p.points > 0 ? "text-emerald-400" : p.points < 0 ? "text-red-400" : "")}>{signed(p.points)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
                    <div className="text-sm font-bold tabular-nums">{signed(t[p.id] ?? 0)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onScores}>
            <BarChart3 /> {last ? "Settle up" : "Scoreboard"}
          </Button>
          {host ? (
            <Button variant="gold" onClick={last ? onScores : next} data-testid="next-round">
              <Play fill="currentColor" /> {last ? "See who owes whom" : "Deal next round"}
            </Button>
          ) : (
            <span className="self-center text-sm text-muted-foreground">{last ? "That was the last round." : `Waiting for ${name(v.hostId)} to deal…`}</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
