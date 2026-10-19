import { cn } from "@/lib/utils";
import { PlayingCard } from "./PlayingCard";
import { cardLabel } from "../../../shared/cards";

interface Props {
  cw: number;
  stockCount: number;
  discardTop: string | null;
  discardUnder: string | null;
  maal: string | null;
  maalHidden: boolean;
  canDraw: boolean;
  /** Taking the top discard is allowed right now (pick-up rule). */
  canPickDiscard: boolean;
  /** Who threw the top card (shown under the pile). */
  thrownBy?: string | null;
  onDraw(from: "stock" | "discard"): void;
}

function Caption({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span className={cn("mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em]", active ? "text-white" : "text-white/55")}>{children}</span>
  );
}

/** Stock, maal and discard pile in the middle of the felt. */
export function Piles({ cw, stockCount, discardTop, discardUnder, maal, maalHidden, canDraw, canPickDiscard, thrownBy, onDraw }: Props) {
  const canPick = canPickDiscard && !!discardTop;
  return (
    <div className="flex items-end justify-center gap-[clamp(14px,4vw,40px)]">
      <button
        type="button"
        className={cn("flex flex-col items-center outline-none", canDraw ? "cursor-pointer" : "cursor-default")}
        onClick={() => canDraw && onDraw("stock")}
        disabled={!canDraw}
        aria-label={`Draw from stock, ${stockCount} cards left`}
        data-testid="stock"
      >
        <div className={cn("relative rounded-lg transition-transform", canDraw && "hover:-translate-y-1")}>
          <PlayingCard width={cw} className="absolute left-[3px] top-[3px] opacity-60" />
          <PlayingCard width={cw} className={cn("relative", canDraw && "ring-2 ring-gold shadow-[0_0_20px_rgba(245,184,61,.5)]")} />
          <span className="absolute -right-2 -top-2 rounded-full bg-[#0b1713] px-1.5 text-[10px] font-bold tabular-nums ring-1 ring-white/15">{stockCount}</span>
        </div>
        <Caption active={canDraw}>Stock</Caption>
      </button>

      <div className="flex flex-col items-center" aria-label={maal ? "Maal card" : "Maal card, hidden until you show"}>
        <div className={cn("relative", maal && "drop-shadow-[0_0_14px_rgba(245,184,61,.55)]")}>
          {maal ? (
            <PlayingCard id={maal} width={cw * 0.86} maal={maal} />
          ) : (
            <PlayingCard width={cw * 0.86} className={cn("opacity-90", !maalHidden && "opacity-40")} />
          )}
        </div>
        <Caption active={!!maal}>{maal ? "Maal" : "Maal ?"}</Caption>
      </div>

      <button
        type="button"
        className={cn("relative flex flex-col items-center outline-none", canPick ? "cursor-pointer" : "cursor-default")}
        onClick={() => canPick && onDraw("discard")}
        disabled={!canPick}
        title={canDraw && discardTop && !canPick ? "You can pick this up only if it completes a pure set" : undefined}
        aria-label={discardTop ? (canPick ? "Pick up the top discard" : "Top discard (can't pick up)") : "Discard pile is empty"}
        data-testid="discard"
      >
        <div className="relative rounded-lg border-2 border-dashed border-transparent p-0.5"
          style={{ minWidth: cw + 8, minHeight: cw * 1.42 + 8 }}
        >
          {discardUnder && <PlayingCard id={discardUnder} width={cw} maal={maal} className="absolute left-[-3px] top-[2px] rotate-[-6deg] opacity-80" />}
          {discardTop ? (
            // Keyed by card so every new throw lands with a little drop.
            <div key={discardTop} className="relative rotate-[3deg] motion-safe:animate-card-drop">
              <PlayingCard
                id={discardTop}
                width={cw}
                maal={maal}
                className={cn("transition-transform", canPick && "ring-2 ring-gold/70 hover:-translate-y-1")}
              />
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-white/20" style={{ width: cw, height: cw * 1.42 }} />
          )}
        </div>
        <Caption active={canPick}>Discard</Caption>
        <span className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-white/60" aria-live="polite">
          {thrownBy && discardTop ? `${thrownBy} threw ${cardLabel(discardTop)}` : ""}
        </span>
      </button>
    </div>
  );
}
