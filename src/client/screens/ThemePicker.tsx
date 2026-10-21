import { Check } from "lucide-react";
import { ThemeSwatch } from "@/components/theme/decor";
import { setTheme, THEMES, useTheme } from "@/lib/themes";
import { cn } from "@/lib/utils";

/** Pick how the table looks on this device. Others at the table keep their own choice. */
export function ThemePicker({ compact }: { compact?: boolean }) {
  const theme = useTheme();
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")} role="radiogroup" aria-label="Table look">
      {THEMES.map((t, i) => {
        const on = t.id === theme;
        return (
          <button
            key={t.id}
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => setTheme(t.id)}
            onKeyDown={(e) => {
              // Arrow keys move between looks, as in a radio group.
              const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              const next = THEMES[(i + step + THEMES.length) % THEMES.length];
              setTheme(next.id);
              (e.currentTarget.parentElement?.children[THEMES.indexOf(next)] as HTMLElement | undefined)?.focus();
            }}
            className={cn(
              "group relative overflow-hidden rounded-xl border text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-gold",
              on ? "border-gold ring-2 ring-gold/50" : "border-white/10 hover:border-white/25",
            )}
          >
            <div className="relative aspect-[132/80] w-full">
              <ThemeSwatch theme={t.id} />
            </div>
            <div className="bg-black/40 px-2.5 py-1.5">
              <div className={cn("text-xs font-bold leading-tight", compact ? "line-clamp-2" : "truncate")}>{t.name}</div>
              {!compact && <div className="truncate text-[10px] text-muted-foreground">{t.tagline}</div>}
            </div>
            {on && (
              <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[#2a1d00] shadow">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
