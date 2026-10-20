import { useState } from "react";
import { BarChart3, BookOpen, Bot, Flag, LogOut, Maximize, Minimize, RotateCcw, Share2, Vibrate, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { canFullscreen, toggleFullscreen, useFullscreen } from "@/lib/fullscreen";
import { navigate } from "@/lib/router";
import { act, leaveTable } from "@/lib/store";
import { hapticsOn, setHaptics, setSound, soundOn } from "@/lib/sound";
import { RulesSheet } from "./RulesSheet";
import { ThemePicker } from "./ThemePicker";
import { shareInvite } from "./Lobby";
import type { TableView } from "../../shared/protocol";

function Item({ icon: Icon, label, onClick, danger }: { icon: typeof BookOpen; label: string; onClick(): void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-white/5 [@media(max-height:500px)]:py-1.5 ${danger ? "text-red-300" : ""}`}>
      <Icon className="h-4 w-4 opacity-80" /> {label}
    </button>
  );
}

export function MenuSheet({ view: v, open, onOpenChange, onScores }: { view: TableView; open: boolean; onOpenChange(o: boolean): void; onScores(): void }) {
  const [sound, setS] = useState(soundOn());
  const [haptic, setH] = useState(hapticsOn());
  const [rules, setRules] = useState(false);
  const full = useFullscreen();
  const host = v.hostId === v.you;
  const me = v.seats.find((s) => s.id === v.you);
  const close = () => onOpenChange(false);
  const run = async (e: string, p?: Record<string, unknown>) => {
    const r = await act(e, p);
    if (!r.ok) toast.error(r.error ?? "Something went wrong.");
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-[300px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Table {v.code}</SheetTitle>
            <SheetDescription>{v.seats.length} players · {v.settings.pointRate} {v.settings.currency}/pt</SheetDescription>
          </SheetHeader>
          <nav className="mt-4 space-y-0.5">
            <Item icon={BarChart3} label="Scoreboard & settle up" onClick={() => (close(), onScores())} />
            <Item icon={BookOpen} label="Rules" onClick={() => setRules(true)} />
            {canFullscreen() && (
              <Item icon={full ? Minimize : Maximize} label={full ? "Exit full screen" : "Full screen"} onClick={() => (close(), toggleFullscreen())} />
            )}
            {!v.practice && <Item icon={Share2} label="Invite players" onClick={() => shareInvite(v.code)} />}
            {me && !me.isBot && (
              <Item icon={Bot} label={me.autoplay ? "Take back control" : "Let a bot play for me"} onClick={() => (close(), run("autoplay", { on: !me.autoplay }))} />
            )}
          </nav>
          <Separator className="my-2" />
          <div className="px-3 pb-1">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Table look</p>
            <ThemePicker compact />
          </div>
          <Separator className="my-2" />
          <div className="space-y-1 px-3">
            <label className="flex items-center justify-between py-1.5 text-sm font-semibold">
              <span className="flex items-center gap-3"><Volume2 className="h-4 w-4 opacity-80" /> Sound</span>
              <Switch checked={sound} onCheckedChange={(c) => (setSound(c), setS(c))} />
            </label>
            <label className="flex items-center justify-between py-1.5 text-sm font-semibold">
              <span className="flex items-center gap-3"><Vibrate className="h-4 w-4 opacity-80" /> Haptics</span>
              <Switch checked={haptic} onCheckedChange={(c) => (setHaptics(c), setH(c))} />
            </label>
          </div>
          {host && (
            <>
              <Separator className="my-2" />
              <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Host</p>
              <nav className="space-y-0.5">
                {v.seats
                  .filter((s) => !s.isBot && s.id !== v.you && !s.connected)
                  .map((s) => (
                    <Item key={s.id} icon={Bot} label={s.autoplay ? `Give ${s.name} back control` : `Bot plays for ${s.name} (offline)`} onClick={() => run("autoplay", { id: s.id, on: !s.autoplay })} />
                  ))}
                {v.status === "matchEnd" ? (
                  <Item icon={RotateCcw} label="Start a new match" onClick={() => (close(), run("newMatch"))} />
                ) : (
                  <Item
                    icon={Flag}
                    label="End match now"
                    danger
                    onClick={() => {
                      if (confirm("End the match for everyone? Scores so far will be settled.")) {
                        close();
                        run("endMatch");
                      }
                    }}
                  />
                )}
              </nav>
            </>
          )}
          <Separator className="my-2" />
          <Item
            icon={LogOut}
            label="Leave table"
            danger
            onClick={async () => {
              if (v.status === "playing" && !confirm("Leave in the middle of a round? A bot will take your turns.")) return;
              await leaveTable();
              navigate("/");
            }}
          />
        </SheetContent>
      </Sheet>
      <RulesSheet open={rules} onOpenChange={setRules} settings={v.settings} />
    </>
  );
}
