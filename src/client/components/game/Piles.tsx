import { cn } from "@/lib/utils";
import { PlayingCard } from "./PlayingCard";
import { cardLabel } from "../../../shared/cards";
import { MaalAccent } from "@/components/theme/decor";
import { useTheme } from "@/lib/themes";

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
  /** The discard slot, so the hand can aim dragged cards at it. */
  slotRef?: React.Ref<HTMLDivElement>;
  /** A card is being dragged over the drop zone: ok, or the reason it can't be thrown. */
  dropState?: true | string | null;
  /** A card the player just threw by dragging: hidden until its flight lands, then shown without the drop. */
  incoming?: { id: string; landed: boolean } | null;
  onDraw(from: "stock" | "discard"): void;
}

function Caption({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={cn("mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] [text-shadow:0_1px_3px_rgba(0,0,0,.7)]", active ? "text-white" : "text-white/65")}
    >
      {children}
    </span>
  );
}

/** Stock, maal and discard pile in the middle of the felt. */
export function Piles({ cw, stockCount, discardTop, discardUnder, maal, maalHidden, canDraw, canPickDiscard, thrownBy, slotRef, dropState, incoming, onDraw }: Props) {
  const theme = useTheme();
  const canPick = canPickDiscard && !!discardTop;
  const flown = !!incoming && incoming.id === discardTop;
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
          {stockCount > 0 && (
            <span className="absolute -right-2 -top-2 rounded-full bg-[#0b1713] px-1.5 text-[10px] font-bold tabular-nums ring-1 ring-white/15">{stockCount}</span>
          )}
        </div>
        <Caption active={canDraw}>Stock</Caption>
      </button>

      <div className="flex flex-col items-center" aria-label={maal ? "Maal card" : "Maal card, hidden until you show"}>
        <div className={cn("relative rounded-lg", maal && "drop-shadow-[0_0_14px_rgba(245,184,61,.55)]", maal && theme !== "classic" && "ring-2 ring-gold/80")}>

          {maal ? (
            <PlayingCard id={maal} width={cw * 0.86} maal={maal} />
          ) : (
            <PlayingCard width={cw * 0.86} className={cn("opacity-90", !maalHidden && "opacity-40")} />
          )}
        </div>
        <Caption active={!!maal}>
          <span className="inline-flex items-center gap-1">
            {maal && theme !== "classic" && <MaalAccent theme={theme} size={13} />}
            {maal ? "Maal" : "Maal ?"}
          </span>
        </Caption>
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
        <div
          ref={slotRef}
          className={cn(
            "relative rounded-lg border-2 border-dashed border-transparent p-0.5 transition-[transform,background-color,border-color,box-shadow] duration-150",
            dropState === true && "border-gold bg-gold/15 shadow-[0_0_24px_rgba(245,184,61,.55)] motion-safe:scale-[1.06]",
            typeof dropState === "string" && "border-destructive bg-destructive/15",
          )}
          style={{ minWidth: cw + 8, minHeight: cw * 1.42 + 8 }}
        >
          {discardUnder && <PlayingCard id={discardUnder} width={cw} maal={maal} className="absolute left-[-3px] top-[2px] rotate-[-6deg] opacity-80" />}
          {discardTop ? (
            // Keyed by card so every new throw lands with a little drop.
            <div className="relative rotate-[3deg]">
              <div key={discardTop} className={cn(!flown && "motion-safe:animate-card-drop", flown && !incoming?.landed && "opacity-0")}>
                <PlayingCard
                  id={discardTop}
                  width={cw}
                  maal={maal}
                  className={cn("transition-transform", canPick && "ring-2 ring-gold/70 hover:-translate-y-1")}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-white/20" style={{ width: cw, height: cw * 1.42 }} />
          )}
        </div>
        {dropState ? (
          <Caption active>
            <span className={dropState === true ? "text-gold" : "text-white"}>{dropState === true ? "Release to throw" : dropState}</span>
          </Caption>
        ) : (
          <Caption active={canPick}>Discard</Caption>
        )}
        <span className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-white/60" aria-live="polite">
          {thrownBy && discardTop ? `${thrownBy} threw ${cardLabel(discardTop)}` : ""}
        </span>
      </button>
    </div>
  );
}
