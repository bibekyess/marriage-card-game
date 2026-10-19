import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CardId } from "../../../shared/cards";
import { PlayingCard } from "./PlayingCard";

interface Props {
  cards: CardId[];
  maal: CardId | null;
  selected: Set<CardId>;
  drawn: CardId | null;
  cardWidth: number;
  onToggle(id: CardId): void;
  onReorder(order: CardId[]): void;
  /** Called when a card is flicked upwards; return value ignored. */
  onSwipeUp?(id: CardId): void;
}

interface Drag {
  id: CardId;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
}

/**
 * The player's hand: cards overlap to fit the width (two rows on narrow screens).
 * Tap to select, drag sideways to rearrange, flick up to throw.
 */
export function Hand({ cards, maal, selected, drawn, cardWidth, onToggle, onReorder, onSwipeUp }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [drag, setDrag] = useState<Drag | null>(null);
  const cw = cardWidth;
  const ch = Math.round(cw * 1.42);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const n = cards.length;
  const layout = useMemo(() => {
    const oneRowStep = n > 1 ? Math.min(cw + 4, (width - cw) / (n - 1)) : 0;
    const rows = oneRowStep < cw * 0.42 && n > 12 ? 2 : 1;
    const perRow = rows === 2 ? Math.ceil(n / 2) : n;
    const step = perRow > 1 ? Math.min(cw + 4, (width - cw) / (perRow - 1)) : 0;
    const rowGap = Math.round(ch * 0.58);
    return { rows, perRow, step, rowGap, height: ch + (rows - 1) * rowGap + 14 };
  }, [n, cw, ch, width]);

  const slot = (i: number) => {
    const row = layout.rows === 2 && i >= layout.perRow ? 1 : 0;
    const col = i - row * layout.perRow;
    const inRow = row === 0 ? Math.min(n, layout.perRow) : n - layout.perRow;
    const total = cw + (inRow - 1) * layout.step;
    const left = (width - total) / 2;
    return { x: left + col * layout.step, y: 12 + row * layout.rowGap };
  };

  // Where the dragged card would land.
  const target = useMemo(() => {
    if (!drag?.moved) return -1;
    // Use where the dragged card actually is (its centre), not where the finger is.
    const from = slot(cards.indexOf(drag.id));
    const px = from.x + drag.x - drag.startX;
    const py = from.y + drag.y - drag.startY + ch / 2;
    const row = layout.rows === 2 && py > 12 + ch / 2 + layout.rowGap / 2 ? 1 : 0;
    const inRow = row === 0 ? Math.min(n, layout.perRow) : n - layout.perRow;
    const total = cw + (inRow - 1) * layout.step;
    const left = (width - total) / 2;
    const col = Math.max(0, Math.min(inRow - 1, Math.round((px - left) / (layout.step || 1))));
    return Math.min(n - 1, row * layout.perRow + col);
  }, [drag, layout, n, cw, ch, width, cards]);

  const order = useMemo(() => {
    if (!drag?.moved || target < 0) return cards;
    const rest = cards.filter((c) => c !== drag.id);
    rest.splice(target, 0, drag.id);
    return rest;
  }, [cards, drag, target]);

  useEffect(() => {
    if (drag && !cards.includes(drag.id)) setDrag(null);
  }, [cards, drag]);

  const onDown = (e: React.PointerEvent, id: CardId) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, moved: false });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, moved });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) return onToggle(d.id);
    // Throw only when the card is flicked clearly out of the hand, upwards.
    const top = ref.current?.getBoundingClientRect().top ?? 0;
    if (onSwipeUp && e.clientY < top - ch * 0.25 && Math.abs(e.clientX - d.startX) < cw * 3) return onSwipeUp(d.id);
    if (order.join() !== cards.join()) onReorder(order);
  };

  return (
    <div ref={ref} className="relative w-full touch-none" style={{ height: layout.height }} data-testid="hand">
      {order.map((id, i) => {
        const dragging = drag?.moved && drag.id === id;
        const p = slot(i);
        const lift = selected.has(id) ? -Math.round(ch * 0.16) : 0;
        let style: React.CSSProperties = { transform: `translate(${p.x}px, ${p.y + lift}px)`, left: 0, top: 0, zIndex: i + 1 };
        if (dragging) {
          const from = slot(cards.indexOf(id));
          const x = from.x + drag!.x - drag!.startX;
          const y = from.y + drag!.y - drag!.startY;
          style = { transform: `translate(${x}px, ${y}px) rotate(-3deg)`, left: 0, top: 0, zIndex: 100, transition: "none" };
        }
        return (
          <button
            key={id}
            type="button"
            className="absolute cursor-grab outline-none transition-transform duration-200 ease-out focus-visible:[&>div]:ring-2 focus-visible:[&>div]:ring-gold active:cursor-grabbing"
            style={style}
            onPointerDown={(e) => onDown(e, id)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => setDrag(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle(id);
              }
            }}
            aria-pressed={selected.has(id)}
            data-card={id}
          >
            <PlayingCard id={id} width={cw} maal={maal} selected={selected.has(id)} className={dragging ? "shadow-lift" : ""} />
            {drawn === id && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gold px-1.5 py-[1px] text-[9px] font-extrabold uppercase tracking-wide text-[#2a1d00] shadow">
                New
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
