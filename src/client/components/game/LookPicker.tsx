import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { LOOK_SETS, lookSet } from "../../../shared/looks";
import { Avatar } from "./Avatar";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  /** Seat colour behind the picture. */
  index?: number;
  value: string | null;
  /** Called with the chosen look (null for initials); the dialog closes itself. */
  onPick: (look: string | null) => void;
}

/** Grid of avatar pictures to choose from, plus plain initials. */
export function LookDialog({ open, onOpenChange, name, index = 0, value, onPick }: Props) {
  const [tab, setTab] = useState<string>(lookSet(value).id);
  // Open on the tab of your current look.
  useEffect(() => {
    if (open) setTab(lookSet(value).id);
  }, [open, value]);
  const pick = (look: string | null) => {
    onPick(look);
    onOpenChange(false);
  };
  const option = (look: string | null, label: string) => (
    <button
      key={look ?? "initials"}
      type="button"
      role="radio"
      aria-checked={look === value}
      aria-label={label}
      onClick={() => pick(look)}
      className={cn(
        "flex aspect-square items-center justify-center rounded-full p-0.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold motion-safe:hover:scale-105",
        look === value ? "ring-2 ring-gold" : "ring-1 ring-white/10 hover:ring-white/30",
      )}
      data-testid="look-option"
    >
      <Avatar name={name || "?"} index={index} look={look} size={48} className="!h-full !w-full" />
    </button>
  );
  const credit = CREDITS[tab];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94dvh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pick your avatar</DialogTitle>
          <DialogDescription>Everyone at the table sees it next to your name.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-col">
          <TabsList className="h-auto w-full shrink-0 justify-start overflow-x-auto bg-black/30 [scrollbar-width:none]">
            {LOOK_SETS.map((s) => (
              <TabsTrigger key={s.id} value={s.id} className="data-[state=active]:text-gold">
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* Only the open tab is mounted, so its pictures are the only ones fetched. */}
          {LOOK_SETS.map((s) => (
            <TabsContent key={s.id} value={s.id} className="min-h-0 overflow-y-auto p-1">
              <div className="grid grid-cols-5 gap-2 min-[400px]:grid-cols-6" role="radiogroup" aria-label={`${s.label} avatars`}>
                {s.looks.map((look, i) => option(look, `${s.label} avatar ${i + 1}`))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
          <button
            type="button"
            onClick={() => pick(null)}
            aria-pressed={value === null}
            className={cn(
              "flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold",
              value === null ? "bg-gold/15 text-gold ring-1 ring-gold/60" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Avatar name={name || "?"} index={index} size={28} /> Just my initials
          </button>
          {credit && <p className="text-right text-[10px] leading-tight text-muted-foreground">{credit}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Artists whose licence asks for credit (the other sets are public domain). */
const CREDITS: Record<string, string> = {
  e: "Fun Emoji by Davis Uche, CC BY 4.0",
  a: "Adventurer by Lisa Wischofsky, CC BY 4.0",
  t: "Avataaars by Pablo Stanley",
};

/** Your avatar as a button that opens the picker. */
export function LookButton({ name, index = 0, look, size = 48, onClick }: { name: string; index?: number; look: string | null; size?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Change your avatar"
      title="Change your avatar"
      className="group relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      data-testid="look-button"
    >
      <Avatar name={name || "?"} index={index} look={look} size={size} />
      <span className="absolute -bottom-1 -right-1 rounded-full bg-gold px-1.5 text-[9px] font-extrabold leading-[15px] text-[#2a1d00] shadow ring-2 ring-background group-hover:brightness-110">
        Edit
      </span>
    </button>
  );
}
