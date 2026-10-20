import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CardId } from "../../../shared/cards";
import { PlayingCard } from "./PlayingCard";
import { cn } from "@/lib/utils";

export interface HandGroup {
  cards: CardId[];
  label: string;
}

interface Props {
  cards: CardId[];
  /** The player's own groups; they sit apart from the rest, each with a tag. */
  groups?: HandGroup[];
  onGroupTap?(index: number): void;
  onUngroup?(index: number): void;
  maal: CardId | null;
  selected: Set<CardId>;
  drawn: CardId | null;
  /** Cards to highlight (e.g. tunnels about to be shown). */
  glow?: Set<CardId>;
  cardWidth: number;
  onToggle(id: CardId): void;
  onReorder(order: CardId[], moved?: CardId): void;
  /** Called when a card is flicked upwards; return value ignored. */
  onSwipeUp?(id: CardId): void;
  /** Identifies the current deal (table + round); the hand fans in when it changes. */
  dealKey?: string;
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
const NO_GROUPS: HandGroup[] = [];

export function Hand({ cards, groups = NO_GROUPS, onGroupTap, onUngroup, maal, selected, drawn, glow, cardWidth, onToggle, onReorder, onSwipeUp, dealKey }: Props) {
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
  // Fan the hand in once per deal. Remembered per tab, so a refresh doesn't replay it.
  const [dealing, setDealing] = useState(false);
  useEffect(() => {
    if (!dealKey) return;
    let seen: string | null = null;
    try {
      seen = sessionStorage.getItem("mg.dealt");
      sessionStorage.setItem("mg.dealt", dealKey);
    } catch {}
    if (seen === dealKey) return;
    setDealing(true);
    const t = setTimeout(() => setDealing(false), 900);
    return () => clearTimeout(t);
  }, [dealKey]);
  // A gap opens wherever a group starts or ends; gapsBefore[i] counts the gaps left of slot i.
  const groupOf = useMemo(() => {
    const m = new Map<CardId, number>();
    groups.forEach((g, gi) => g.cards.forEach((c) => m.set(c, gi)));
    return m;
  }, [groups]);
  const gapsBefore = useMemo(() => {
    const out = [0];
    for (let i = 1; i < n; i++) {
      const a = groupOf.get(cards[i - 1]), b = groupOf.get(cards[i]);
      out.push(out[i - 1] + (a !== b ? 1 : 0));
    }
    return out;
  }, [cards, groupOf, n]);
  const gap = groups.length ? Math.round(cw * 0.3) : 0;
  const tagH = groups.length ? 20 : 0;

  const layout = useMemo(() => {
    const room = width - cw - (gapsBefore[n - 1] ?? 0) * gap;
    const oneRowStep = n > 1 ? Math.min(cw + 4, room / (n - 1)) : 0;
    const rows = oneRowStep < cw * 0.42 && n > 12 ? 2 : 1;
    const perRow = rows === 2 ? Math.ceil(n / 2) : n;
    const step = perRow > 1 ? Math.max(cw * 0.2, Math.min(cw + 4, room / (perRow - 1))) : 0;
    const rowGap = Math.round(ch * 0.58);
    return { rows, perRow, step, rowGap, height: tagH + ch + (rows - 1) * rowGap + 14 };
  }, [n, cw, ch, width, gapsBefore, gap, tagH]);

  const slot = (i: number) => {
    const row = layout.rows === 2 && i >= layout.perRow ? 1 : 0;
    const col = i - row * layout.perRow;
    const first = row * layout.perRow;
    const inRow = row === 0 ? Math.min(n, layout.perRow) : n - layout.perRow;
    const rowGaps = (gapsBefore[first + inRow - 1] ?? 0) - (gapsBefore[first] ?? 0);
    const total = cw + (inRow - 1) * layout.step + rowGaps * gap;
    const left = (width - total) / 2;
    return { x: left + col * layout.step + ((gapsBefore[i] ?? 0) - (gapsBefore[first] ?? 0)) * gap, y: tagH + 12 + row * layout.rowGap };
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
    if (order.join() !== cards.join()) onReorder(order, d.id);
  };

  return (
    <div ref={ref} className="relative w-full touch-none" style={{ height: layout.height }} data-testid="hand">
      {!drag?.moved &&
        groups.map((g, gi) => {
          const idx = g.cards.map((c) => cards.indexOf(c)).filter((i) => i >= 0);
          if (!idx.length) return null;
          const a = slot(Math.min(...idx)), b = slot(Math.max(...idx));
          const w = a.y === b.y ? b.x + cw - a.x : cw;
          return (
            <div
              key={g.cards.join()}
              className="absolute flex h-[18px] items-center justify-between gap-1 rounded-full bg-black/55 pl-2 pr-0.5 text-[10px] font-bold text-gold ring-1 ring-gold/40"
              style={{ left: a.x, top: a.y - tagH - 2, width: Math.max(w, 64), zIndex: 60 }}
              data-testid="group-tag"
            >
              <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => onGroupTap?.(gi)} title="Select this group">
                {g.label}
              </button>
              <button
                type="button"
                className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/15 hover:text-white"
                onClick={() => onUngroup?.(gi)}
                aria-label={`Ungroup ${g.label}`}
                title="Ungroup"
              >
                ×
              </button>
            </div>
          );
        })}
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
            <div
              className={cn(drawn === id || dealing ? "motion-safe:animate-card-in" : "")}
              style={dealing ? { animationDelay: `${i * 22}ms` } : undefined}
            >
              <PlayingCard id={id} width={cw} maal={maal} selected={selected.has(id)} glow={glow?.has(id)} className={dragging ? "shadow-lift" : ""} />
            </div>
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
