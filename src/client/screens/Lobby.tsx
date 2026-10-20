import { useState } from "react";
import { Bot, Check, Copy, Crown, LogOut, Play, Settings2, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar } from "@/components/game/Avatar";
import { autoFullscreen } from "@/lib/fullscreen";
import { navigate, tableUrl } from "@/lib/router";
import { act, leaveTable } from "@/lib/store";
import { RulesForm, rulesSummary } from "./RulesForm";
import type { TableView } from "../../shared/protocol";
import { MAX_PLAYERS, Settings } from "../../shared/settings";

export async function shareInvite(code: string) {
  const url = tableUrl(code);
  const text = `Join my Marriage table — code ${code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Marriage card table", text, url });
      return;
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return; // user cancelled; anything else falls back to copying
  }
  try {
    await navigator.clipboard.writeText(`${text}: ${url}`);
    toast.success("Invite link copied");
  } catch {
    toast.message(url);
  }
}

async function run(event: string, payload?: Record<string, unknown>) {
  const r = await act(event, payload);
  if (!r.ok) toast.error(r.error ?? "Something went wrong.");
  return r.ok;
}

export function Lobby({ view: v }: { view: TableView }) {
  const host = v.hostId === v.you;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Settings>(v.settings);
  const [copied, setCopied] = useState(false);
  const hostName = v.seats.find((s) => s.id === v.hostId)?.name ?? "the host";

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(v.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="app-bg h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-4 px-4 pb-24 pt-4 sm:px-6 sm:pt-6">
        <header className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await leaveTable();
              navigate("/");
            }}
          >
            <LogOut /> Leave
          </Button>
          <Badge variant="muted">{v.rounds.length ? `${v.rounds.length} rounds played` : "Waiting for players"}</Badge>
        </header>

        <div className="grid flex-1 gap-4 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] sm:items-start">
        <div className="grid gap-4">
        <section className="surface flex flex-col items-center gap-3 p-5 text-center sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Table code</p>
          <button onClick={copyCode} className="group flex items-center gap-3" aria-label="Copy table code">
            <span className="gold-text pl-[0.25em] text-5xl font-extrabold tracking-[0.25em] sm:text-6xl">{v.code}</span>
            {copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5 text-muted-foreground group-hover:text-foreground" />}
          </button>
          <p className="max-w-xs text-sm text-muted-foreground">Share the link — family can join from any phone or computer.</p>
          <Button variant="felt" onClick={() => shareInvite(v.code)}>
            <Share2 /> Invite players
          </Button>
        </section>

        <section className="surface flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">House rules</div>
            <div className="mt-0.5 text-sm">{rulesSummary(v.settings)}</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft(v.settings);
              setEditing(true);
            }}
          >
            <Settings2 /> {host ? "Edit rules" : "View rules"}
          </Button>
        </section>
        </div>
        <section className="surface p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">
              Players <span className="text-muted-foreground">({v.seats.length}/{MAX_PLAYERS})</span>
            </h2>
            {host && (
              <Button size="sm" variant="secondary" onClick={() => run("addBot")} disabled={v.seats.length >= MAX_PLAYERS}>
                <Bot /> Add bot
              </Button>
            )}
          </div>
          <ul className="divide-y divide-white/[0.06]">
            {v.seats.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={s.name} index={s.avatar} size={38} isBot={s.isBot} offline={!s.connected} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate font-semibold">
                    {s.name}
                    {s.id === v.you && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                    {s.id === v.hostId && <Crown className="h-3.5 w-3.5 text-gold" aria-label="Host" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{s.isBot ? `Computer player · ${v.settings.botSpeed}` : s.connected ? "Ready" : "Offline"}</div>
                </div>
                {host && s.id !== v.you && (
                  <Button size="icon" variant="ghost" aria-label={`Remove ${s.name}`} onClick={() => run("removeSeat", { id: s.id })}>
                    <X />
                  </Button>
                )}
              </li>
            ))}
            {v.spectators.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5 opacity-70">
                <Avatar name={s.name} index={9} size={38} />
                <div className="flex-1 font-semibold">{s.name}</div>
                <Badge variant="muted">Watching</Badge>
              </li>
            ))}
          </ul>
        </section>


        </div>
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.06] bg-background/85 px-4 py-3 backdrop-blur safe-pb">
          <div className="mx-auto max-w-5xl">
          {host ? (
            <Button variant="gold" size="lg" className="h-12 w-full text-base" disabled={v.seats.length < 2} onClick={() => (autoFullscreen(), run("start"))}>
              <Play fill="currentColor" /> {v.seats.length < 2 ? "Waiting for a second player" : "Deal cards"}
            </Button>
          ) : (
            <p className="py-3 text-center text-sm text-muted-foreground">Waiting for {hostName} to deal…</p>
          )}
          </div>
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>House rules</DialogTitle>
            <DialogDescription>{host ? "Everyone at the table sees changes right away." : `Set by ${hostName}.`}</DialogDescription>
          </DialogHeader>
          <RulesForm value={draft} onChange={setDraft} disabled={!host} />
          {host && (
            <DialogFooter>
              <Button
                variant="gold"
                className="w-full"
                onClick={async () => {
                  if (await run("settings", { settings: draft })) setEditing(false);
                }}
              >
                Save rules
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
