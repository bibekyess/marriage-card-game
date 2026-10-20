import { useEffect, useState } from "react";
import { ArrowRight, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar } from "@/components/game/Avatar";
import { nameOf, roundLabel, settlement, signed, totals } from "@/lib/format";
import { scoreImage, scoreText } from "@/lib/shareImage";
import { cn } from "@/lib/utils";
import type { TableView } from "../../shared/protocol";
import { currencyOf, formatMoney } from "../../shared/settings";

const tone = (n: number) => (n > 0 ? "text-emerald-400" : n < 0 ? "text-red-400" : "text-muted-foreground");

function download(file: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast.success("Scorecard image saved");
}

/** Share the (already rendered) scorecard. Rendering first would use up the tap on iOS. */
async function shareScore(v: TableView, file: File | null) {
  const text = scoreText(v);
  if (!file) {
    toast.message("Preparing the scorecard… tap again in a moment.");
    return;
  }
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
    else download(file);
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "AbortError") return;
    download(file);
  }
}

async function copyText(v: TableView) {
  try {
    await navigator.clipboard.writeText(scoreText(v));
    toast.success("Score copied — paste it in the family chat");
  } catch {
    toast.error("Couldn't copy.");
  }
}

function useWide() {
  const get = () => window.innerWidth > window.innerHeight && window.innerWidth >= 700;
  const [wide, setWide] = useState(get);
  useEffect(() => {
    const on = () => setWide(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return wide;
}

/** Short column label so 5 players fit on a phone. */
const short = (name: string, n: number) => (n > 3 && Array.from(name).length > 7 ? Array.from(name).slice(0, 6).join("") + "…" : name);

export function ScoreSheet({ view: v, open, onOpenChange }: { view: TableView; open: boolean; onOpenChange(o: boolean): void }) {
  const wide = useWide();
  const [file, setFile] = useState<File | null>(null);
  const roundsPlayed = v.rounds.length;
  useEffect(() => {
    if (!open) return;
    let live = true;
    setFile(null);
    scoreImage(v).then((blob) => live && setFile(new File([blob], `marriage-${v.code}.png`, { type: "image/png" })));
    return () => {
      live = false;
    };
    // Re-render only when the scores change, not on every table update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roundsPlayed, v.code]);
  const t = totals(v);
  const ids = Object.keys(t);
  const name = (id: string) => nameOf(v, id);
  const seat = (id: string) => v.seats.find((s) => s.id === id);
  const { net, transfers } = settlement(v);
  const cur = v.settings.currency;
  const planned = v.settings.rounds || v.rounds.length;
  const rows = Array.from({ length: Math.max(planned, v.rounds.length) }, (_, i) => v.rounds[i] ?? null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={wide ? "right" : "bottom"}
        className={cn("overflow-y-auto", wide ? "w-[min(560px,100vw)] sm:max-w-none" : "mx-auto max-h-[92dvh] max-w-3xl rounded-t-2xl")}
        data-testid="score-sheet"
      >
        <SheetHeader>
          <SheetTitle>{roundLabel(v)}</SheetTitle>
          <SheetDescription>
            {currencyOf(cur).symbol} {v.settings.pointRate} per point · {v.settings.unseenRule[0].toUpperCase() + v.settings.unseenRule.slice(1)}
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue={v.status === "matchEnd" ? "settle" : "scores"} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="scores">Scoreboard</TabsTrigger>
            <TabsTrigger value="settle">Settle up</TabsTrigger>
          </TabsList>

          <TabsContent value="scores">
            <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2 sm:px-3 font-bold">Round</th>
                    {ids.map((id) => (
                      <th key={id} className={cn("px-2 py-2 sm:px-3 text-right font-bold", id === v.you && "bg-gold/[0.07] text-gold")}>
                        {id === v.you ? "You" : short(name(id), ids.length)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-white/[0.06]">
                      <td className="px-2 py-2 sm:px-3 text-muted-foreground">
                        <span className={cn(v.status === "playing" && i === v.rounds.length && "font-bold text-gold")}>{i + 1}</span>
                        {r && <span className="ml-1.5 text-xs">· {r.winnerId ? `${name(r.winnerId)} won` : "called off"}</span>}
                      </td>
                      {ids.map((id) => (
                        <td key={id} className={cn("px-2 py-2 sm:px-3 text-right font-semibold tabular-nums", id === v.you && "bg-gold/[0.07]", r ? tone(r.points[id] ?? 0) : "text-white/25")}>
                          {r ? signed(r.points[id] ?? 0) : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-white/10 text-base">
                    <td className="px-2 py-2.5 sm:px-3 font-extrabold">Total</td>
                    {ids.map((id) => (
                      <td key={id} className={cn("px-2 py-2.5 sm:px-3 text-right font-extrabold tabular-nums", id === v.you && "bg-gold/[0.07]", tone(t[id]))}>
                        {signed(t[id])}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-white/[0.06]">
                    <td className="px-2 py-2 sm:px-3 text-xs text-muted-foreground">{cur}</td>
                    {ids.map((id) => (
                      <td key={id} className={cn("px-2 py-2 sm:px-3 text-right text-xs font-bold tabular-nums", id === v.you && "bg-gold/[0.07]", tone(net[id] ?? 0))}>
                        {formatMoney(net[id] ?? 0, cur)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="settle" className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {[...ids].sort((a, b) => (net[b] ?? 0) - (net[a] ?? 0)).map((id) => (
                <div key={id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                  <Avatar name={name(id)} index={seat(id)?.avatar ?? 0} look={seat(id)?.look} size={34} isBot={seat(id)?.isBot} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{name(id)}</div>
                    <div className="text-xs text-muted-foreground">{signed(t[id])} pts</div>
                  </div>
                  <div className={cn("text-lg font-extrabold tabular-nums", tone(net[id] ?? 0))}>{formatMoney(net[id] ?? 0, cur)}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-gold/25 bg-gold/[0.06] p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gold">Who pays whom</h3>
              {transfers.length ? (
                <ul className="space-y-2" data-testid="transfers">
                  {transfers.map((tr, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-bold">{name(tr.from)}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="font-bold">{name(tr.to)}</span>
                      <span className="ml-auto font-extrabold tabular-nums text-gold">{formatMoney(tr.amount, cur)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nobody owes anything yet.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="gold" onClick={() => shareScore(v, file)}>
                <Share2 /> Share scorecard
              </Button>
              <Button variant="outline" onClick={() => copyText(v)}>
                <Copy /> Copy text
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
