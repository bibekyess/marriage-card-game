import { useState } from "react";
import { BookOpen, Bot, History, LogIn, Palette, Plus, Spade } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { navigate } from "@/lib/router";
import { pref, saveName, savedName, setPref } from "@/lib/session";
import { createTable, joinTable } from "@/lib/store";
import { PlayingCard } from "@/components/game/PlayingCard";
import { RulesSheet } from "./RulesSheet";
import { HistorySheet, YourTables } from "./HomeExtras";
import { ThemePicker } from "./ThemePicker";
import { RulesForm } from "./RulesForm";
import { DEFAULT_SETTINGS, sanitizeSettings, Settings } from "../../shared/settings";

export function Home() {
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | "create" | "practice">(null);
  const [rules, setRules] = useState(false);
  const [history, setHistory] = useState(false);
  const [look, setLook] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => sanitizeSettings(pref("settings", DEFAULT_SETTINGS)));
  const [bots, setBots] = useState(3);

  const needName = () => {
    if (name.trim()) return false;
    toast.error("Enter your name first.");
    document.getElementById("name")?.focus();
    return true;
  };

  async function go(kind: "create" | "practice" | "join") {
    if (needName()) return;
    saveName(name);
    setBusy(true);
    const r =
      kind === "join"
        ? await joinTable(code, name)
        : await createTable(name, settings, kind === "practice" ? bots : 0);
    setBusy(false);
    if (!r.ok || !r.data) return toast.error(r.error ?? "Something went wrong.");
    if (kind !== "join") setPref("settings", settings);
    setDialog(null);
    navigate(`/t/${(r.data as { code: string }).code}`);
  }

  return (
    <div className="app-bg h-full overflow-y-auto">
      <div className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-4 py-6 sm:px-8 sm:py-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-[#f7c45a] to-[#eba52a] text-[#2a1d00] shadow">
              <Spade className="h-5 w-5" fill="currentColor" />
            </div>
            <span className="text-lg font-extrabold tracking-tight">Marriage</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setLook(true)}>
              <Palette /> Look
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setHistory(true)}>
              <History /> History
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRules(true)}>
              <BookOpen /> Rules
            </Button>
          </div>
        </header>

        <main className="grid flex-1 items-center gap-10 py-8 md:grid-cols-[1.1fr_1fr]">
          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-gold">Nepali Marriage · 3 decks · 21 cards</p>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              Deal in the family,
              <br />
              <span className="gold-text">wherever they are.</span>
            </h1>
            <p className="mt-4 max-w-md text-muted-foreground">
              Open a table, share the code, and play a full match in the browser. Scores and who-owes-whom are worked out for you.
            </p>
            <div className="mt-8 hidden gap-[-20px] md:flex" aria-hidden>
              {["QH0", "AS2", "JC0", "7D1"].map((c, i) => (
                <PlayingCard
                  key={c}
                  id={c}
                  width={84}
                  maal={c === "7D1" ? "7D1" : null}
                  style={{ transform: `rotate(${(i - 1.5) * 7}deg) translateY(${Math.abs(i - 1.5) * 8}px)`, marginLeft: i ? -22 : 0 }}
                />
              ))}
            </div>
          </section>

          <div className="grid gap-4">
          <section className="surface p-5 sm:p-6">
            <Label htmlFor="name" className="text-xs uppercase tracking-wider text-muted-foreground">
              Your name
            </Label>
            <Input
              id="name"
              value={name}
              maxLength={18}
              placeholder="e.g. Sujan"
              onChange={(e) => setName(e.target.value)}
              className="mt-2 h-12 text-base"
              autoComplete="nickname"
            />

            <div className="mt-5 grid gap-3">
              <Button variant="gold" size="xl" onClick={() => !needName() && setDialog("create")} disabled={busy}>
                <Plus /> Create a table
              </Button>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (code.length === 4) go("join");
                }}
              >
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 4))}
                  placeholder="CODE"
                  aria-label="Table code"
                  className="h-12 flex-1 text-center text-lg font-bold uppercase tracking-[0.4em] placeholder:tracking-[0.3em]"
                  autoCapitalize="characters"
                />
                <Button type="submit" variant="felt" size="lg" className="h-12" disabled={busy || code.length !== 4}>
                  <LogIn /> Join
                </Button>
              </form>
              <div className="my-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
              </div>
              <Button variant="outline" size="lg" onClick={() => !needName() && setDialog("practice")} disabled={busy}>
                <Bot /> Practice with bots
              </Button>
            </div>
          </section>
          <YourTables />
          </div>
        </main>
      </div>

      <Dialog open={dialog === "create"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle>New table</DialogTitle>
            <DialogDescription>Set the stakes and house rules. You can change them between rounds.</DialogDescription>
          </DialogHeader>
          <RulesForm value={settings} onChange={setSettings} />
          </div>
          <DialogFooter className="shrink-0 border-t border-white/[0.06] bg-popover px-5 py-3 sm:px-6">
            <Button variant="gold" size="lg" className="w-full" onClick={() => go("create")} disabled={busy}>
              Open table
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "practice"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle>Practice with bots</DialogTitle>
            <DialogDescription>Play a match against computer players. Nobody else can join.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3">
            <span className="text-sm font-semibold">Bots at the table</span>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map((n) => (
                <Button key={n} size="sm" variant={bots === n ? "gold" : "secondary"} onClick={() => setBots(n)} className="w-9">
                  {n}
                </Button>
              ))}
            </div>
          </div>
          <RulesForm value={settings} onChange={setSettings} />
          </div>
          <DialogFooter className="shrink-0 border-t border-white/[0.06] bg-popover px-5 py-3 sm:px-6">
            <Button variant="gold" size="lg" className="w-full" onClick={() => go("practice")} disabled={busy}>
              Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RulesSheet open={rules} onOpenChange={setRules} />
      <HistorySheet open={history} onOpenChange={setHistory} />
      <Dialog open={look} onOpenChange={setLook}>
        <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Table look</DialogTitle>
            <DialogDescription>Choose how the table looks on this device. Everyone at the table can pick their own.</DialogDescription>
          </DialogHeader>
          <ThemePicker />
        </DialogContent>
      </Dialog>
    </div>
  );
}
