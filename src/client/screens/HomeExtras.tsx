import { useEffect, useState } from "react";
import { ChevronRight, History, PlayCircle, Trash2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { navigate } from "@/lib/router";
import { forgetSession, savedSessions } from "@/lib/session";
import { deleteMatch, listMatches, MatchRecord, viewFromRecord } from "@/lib/history";
import { settlement, signed, totals } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ScoreSheet } from "./ScoreSheet";
import type { TableStatusInfo } from "../../shared/protocol";
import { formatMoney } from "../../shared/settings";

const STATUS: Record<string, string> = {
  lobby: "Waiting to start",
  playing: "Round in play",
  roundEnd: "Between rounds",
  matchEnd: "Match finished",
};

/** Tables this device has a seat at, so you can get back in even without the link. */
export function YourTables() {
  const [rows, setRows] = useState<{ code: string; info: TableStatusInfo }[]>([]);

  useEffect(() => {
    let live = true;
    const codes = savedSessions().map((s) => s.code);
    Promise.all(
      codes.map(async (code) => {
        try {
          const r = await fetch(`/api/tables/${code}`);
          const info = (await r.json()) as TableStatusInfo;
          // The server says the table is gone: drop the stale seat. Network trouble: keep it.
          if (!info.exists) forgetSession(code);
          return { code, info };
        } catch {
          return { code, info: { exists: true } as TableStatusInfo };
        }
      }),
    ).then((all) => live && setRows(all.filter((x) => x.info.exists)));
    return () => {
      live = false;
    };
  }, []);

  if (!rows.length) return null;
  return (
    <section className="surface p-4" aria-label="Your tables">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Your tables</h2>
      <ul className="space-y-1.5">
        {rows.map(({ code, info }) => (
          <li key={code}>
            <button
              onClick={() => navigate(`/t/${code}`)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5 text-left transition-colors hover:bg-black/35"
            >
              <PlayCircle className="h-5 w-5 shrink-0 text-gold" />
              <div className="min-w-0 flex-1">
                <div className="font-bold tracking-[0.15em]">{code}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {info.status ? STATUS[info.status] : "Rejoin"}
                  {info.status && info.round ? ` · round ${info.round}${info.rounds ? ` of ${info.rounds}` : ""}` : ""}
                  {info.players?.length ? ` · ${info.players.join(", ")}` : ""}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const dateFmt = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
  " · " +
  new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Past matches saved on this device. */
export function HistorySheet({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const [list, setList] = useState<MatchRecord[]>([]);
  const [detail, setDetail] = useState<MatchRecord | null>(null);
  useEffect(() => {
    if (open) setList(listMatches());
  }, [open]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md" data-testid="history-sheet">
          <SheetHeader>
            <SheetTitle>Match history</SheetTitle>
            <SheetDescription>Finished matches played on this device.</SheetDescription>
          </SheetHeader>
          {list.length === 0 ? (
            <div className="mt-10 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
              <History className="h-8 w-8 opacity-50" />
              No finished matches yet. Your results will appear here.
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {list.map((m) => {
                const v = viewFromRecord(m);
                const t = totals(v);
                const { net } = settlement(v);
                const ranked = Object.keys(t).sort((a, b) => t[b] - t[a]);
                const me = net[m.you] ?? 0;
                return (
                  <li key={m.id} className="rounded-xl border border-white/[0.06] bg-black/20">
                    <button className="w-full p-3 text-left" onClick={() => setDetail(m)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{dateFmt(m.endedAt)}</span>
                        <span className="text-xs font-bold tracking-[0.15em] text-muted-foreground">{m.code}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-sm font-bold">
                        <Trophy className="h-4 w-4 text-gold" />
                        {v.names[ranked[0]] ?? "—"} won the match
                        <span className="font-normal text-muted-foreground">· {m.rounds.length} rounds</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="truncate text-muted-foreground">{ranked.map((id) => `${v.names[id]} ${signed(t[id])}`).join(" · ")}</span>
                        <span className={cn("ml-2 shrink-0 font-bold tabular-nums", me > 0 ? "text-emerald-400" : me < 0 ? "text-red-400" : "")}>
                          You {formatMoney(me, m.settings.currency)}
                        </span>
                      </div>
                    </button>
                    <div className="flex justify-end border-t border-white/[0.05] px-2 py-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => {
                          deleteMatch(m.id);
                          setList(listMatches());
                        }}
                        aria-label={`Delete match ${m.code}`}
                      >
                        <Trash2 /> Delete
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SheetContent>
      </Sheet>
      {detail && <ScoreSheet view={viewFromRecord(detail)} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} />}
    </>
  );
}
