import { useState } from "react";
import { ArrowLeft, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { autoFullscreen } from "@/lib/fullscreen";
import { navigate } from "@/lib/router";
import { saveLook, savedLook, saveName, savedName, sessionFor } from "@/lib/session";
import { joinTable } from "@/lib/store";
import { LookButton, LookDialog } from "@/components/game/LookPicker";
import { Loading } from "./Loading";

/** Shown when someone opens a shared /t/CODE link. */
export function JoinScreen({ code, lost }: { code: string; lost: string | null }) {
  const [name, setName] = useState(savedName());
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState(savedLook);
  const [picking, setPicking] = useState(false);

  // A saved seat is being resumed by App; just wait.
  if (sessionFor(code) && !lost) return <Loading text="Taking your seat…" />;

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Enter your name first.");
    saveName(name);
    autoFullscreen();
    setBusy(true);
    const r = await joinTable(code, name);
    setBusy(false);
    if (!r.ok) toast.error(r.error ?? "Couldn't join.");
  }

  return (
    <div className="app-bg flex min-h-full items-center justify-center px-4 py-10">
      <form onSubmit={join} className="surface w-full max-w-sm p-6">
        <button type="button" onClick={() => navigate("/")} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Home
        </button>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">You're invited</p>
        <h1 className="mt-1 text-2xl font-extrabold">
          Table <span className="tracking-[0.2em]">{code}</span>
        </h1>
        {lost && <p className="mt-3 rounded-lg bg-destructive/15 px-3 py-2 text-sm text-red-200">{lost}</p>}
        <label htmlFor="join-name" className="mt-5 block text-xs uppercase tracking-wider text-muted-foreground">
          Your name
        </label>
        <div className="mt-2 flex items-center gap-3">
          <LookButton name={name} look={avatar} onClick={() => setPicking(true)} />
          <Input id="join-name" value={name} maxLength={18} onChange={(e) => setName(e.target.value)} className="h-12 flex-1 text-base" autoFocus placeholder="e.g. Sujan" />
        </div>
        <LookDialog
          open={picking}
          onOpenChange={setPicking}
          name={name}
          value={avatar}
          onPick={(l) => {
            saveLook(l);
            setAvatar(l);
          }}
        />
        <Button type="submit" variant="gold" size="xl" className="mt-5 w-full" disabled={busy}>
          <LogIn /> Join table
        </Button>
      </form>
    </div>
  );
}
