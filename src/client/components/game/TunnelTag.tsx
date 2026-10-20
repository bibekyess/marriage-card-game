import { cn } from "@/lib/utils";

/** Small "T" corner tag on a set of shown cards, marking a tunnela shown at the start. Parent must be `relative`. */
export function TunnelTag({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute -left-1 -top-1 z-10 flex items-center justify-center rounded-full bg-gold font-extrabold leading-none text-[#2a1d00] shadow ring-1 ring-black/40",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.64) }}
      title="Tunnela"
      aria-label="Tunnela"
      role="img"
    >
      T
    </span>
  );
}
