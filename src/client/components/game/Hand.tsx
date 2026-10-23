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
  onGroupTap?(cards: CardId[]): void;
  onUngroup?(cards: CardId[]): void;
  maal: CardId | null;
  selected: Set<CardId>;
  drawn: CardId | null;
  /** Cards to highlight (e.g. tunnels about to be shown). */
  glow?: Set<CardId>;
  cardWidth: number;
  onToggle(id: CardId): void;
  onReorder(order: CardId[], moved?: CardId): void;
  /** Whether a card may be thrown now: true, or a short reason why not. Omit when it isn't time to throw. */
  canThrow?(id: CardId): true | string;
  /** Throw a card dropped on the pile (or flicked up); resolves false if the server refused. */
  onThrow?(id: CardId): Promise<boolean>;
  /** The thrown card has finished flying to the pile. */
  onLanded?(id: CardId): void;
  /** The drag entered or left the throw zone (true = can throw, string = why not). */
  onThrowHover?(state: true | string | null): void;
  /** The discard pile's card slot; dragging a card onto it throws the card. */
  discardRef?: React.RefObject<HTMLElement>;
  /** Identifies the current deal (table + round); the hand fans in when it changes. */
  dealKey?: string;
}

interface Drag {
  id: CardId;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  /** Over the throw zone: true if the card can go, else the reason it can't. */
  zone: true | string | null;
}

interface Flight {
  id: CardId;
  from: string;
  to: string;
}

const FLIGHT_MS = 220;

/**
 * The player's hand: cards overlap to fit the width (two rows on narrow screens).
 * Tap to select, drag sideways to rearrange, drag onto the pile (or flick up) to throw.
 */
const NO_GROUPS: HandGroup[] = [];

export function Hand({ cards, groups = NO_GROUPS, onGroupTap, onUngroup, maal, selected, drawn, glow, cardWidth, onToggle, onReorder, canThrow, onThrow, onLanded, onThrowHover, discardRef, dealKey }: Props) {
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
  const gap = groups.length ? Math.round(cw * 0.45) : 0;
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

  // The order the hand would have if the dragged card were dropped where it is now.
  const orderFor = (d: Drag | null) => {
    // Aiming at the pile is not a rearrange: the rest of the hand stays put.
    if (!d?.moved || d.zone) return cards;
    // Use where the dragged card actually is (its centre), not where the finger is.
    const from = slot(cards.indexOf(d.id));
    const px = from.x + d.x - d.startX;
    const py = from.y + d.y - d.startY + ch / 2;
    const row = layout.rows === 2 && py > 12 + ch / 2 + layout.rowGap / 2 ? 1 : 0;
    const inRow = row === 0 ? Math.min(n, layout.perRow) : n - layout.perRow;
    const total = cw + (inRow - 1) * layout.step;
    const left = (width - total) / 2;
    const col = Math.max(0, Math.min(inRow - 1, Math.round((px - left) / (layout.step || 1))));
    const rest = cards.filter((c) => c !== d.id);
    rest.splice(Math.min(n - 1, row * layout.perRow + col), 0, d.id);
    return rest;
  };
  const order = orderFor(drag);
  const posOf = new Map(order.map((id, i) => [id, i]));

  // The live drag, read by the pointer handlers. A quick flick (iOS especially) can deliver
  // down, move and up before React re-renders, so the handlers can't rely on `drag` state.
  const live = useRef<Drag | null>(null);
  const update = (d: Drag | null) => {
    if ((live.current?.zone ?? null) !== (d?.zone ?? null)) onThrowHover?.(d?.zone ?? null);
    live.current = d;
    setDrag(d);
  };

  // A thrown card stays hidden in the hand until the server takes it (or refuses).
  const [pending, setPending] = useState<CardId | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const ghost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (drag && !cards.includes(drag.id)) update(null);
    if (pending && !cards.includes(pending)) setPending(null);
  }, [cards, drag, pending]);

  useLayoutEffect(() => {
    if (!flight) return;
    let done = false;
    const land = () => {
      done = true;
      setFlight(null);
      onLanded?.(flight.id);
    };
    try {
      ghost.current?.animate([{ transform: flight.from }, { transform: flight.to }], {
        duration: FLIGHT_MS,
        easing: "cubic-bezier(.2,.8,.2,1)",
        fill: "forwards",
      });
    } catch {}
    // A timer, not onfinish, so the pile card always shows even if the animation never runs.
    const t = setTimeout(land, FLIGHT_MS);
    return () => {
      clearTimeout(t);
      if (!done) onLanded?.(flight.id);
    };
  }, [flight]);

  // Where the dragged card sits on the page, and whether that is the throw zone.
  const placed = (d: Drag) => {
    const from = slot(cards.indexOf(d.id));
    return { x: from.x + d.x - d.startX, y: from.y + d.y - d.startY };
  };
  const zoneOf = (d: Drag): Drag["zone"] => {
    const box = ref.current?.getBoundingClientRect();
    if (!d.moved || !canThrow || !box) return null;
    const p = placed(d);
    const cx = box.left + p.x + cw / 2, cy = box.top + p.y + ch / 2;
    const pile = discardRef?.current?.getBoundingClientRect();
    const m = cw * 0.5;
    const overPile = !!pile && cx > pile.left - m && cx < pile.right + m && cy > pile.top - m && cy < pile.bottom + m;
    // Anywhere clearly above the hand counts too, so a quick flick up still throws.
    if (!overPile && d.y > box.top - ch * 0.25) return null;
    return canThrow(d.id);
  };

  const throwCard = (d: Drag) => {
    setPending(d.id);
    // Throw first, so the pile already expects this card when it lands.
    void onThrow?.(d.id).then((ok) => {
      if (!ok) setPending(null);
    });
    const box = ref.current?.getBoundingClientRect();
    const slotEl = discardRef?.current;
    const pile = slotEl?.getBoundingClientRect();
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!box || !slotEl || !pile || still) return onLanded?.(d.id);
    const p = placed(d);
    // Land centred on the pile, at the pile's card size and tilt. The slot may be scaled up
    // while hovered, so its size comes from offsetWidth (unscaled); a centred scale keeps the centre.
    const s = (slotEl.offsetWidth - 8) / cw;
    const tx = pile.left + pile.width / 2 - box.left - cw / 2;
    const ty = pile.top + pile.height / 2 - box.top - ch / 2;
    setFlight({ id: d.id, from: `translate(${p.x}px, ${p.y}px) rotate(-3deg)`, to: `translate(${tx}px, ${ty}px) rotate(3deg) scale(${s})` });
  };

  const onDown = (e: React.PointerEvent, id: CardId) => {
    // Only the first finger drags; a new first touch replaces any drag whose "up" got lost.
    if (e.button !== 0 || !e.isPrimary) return;
    // Capture is a nice-to-have (touch already sticks to the card); never let it block the drag.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    update({ id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, moved: false, zone: null });
  };
  const follow = (d: Drag, e: React.PointerEvent): Drag => {
    const next = { ...d, x: e.clientX, y: e.clientY, moved: d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 8 };
    return { ...next, zone: zoneOf(next) };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = live.current;
    if (d?.pointerId === e.pointerId) update(follow(d, e));
  };
  const onUp = (e: React.PointerEvent) => {
    const prev = live.current;
    if (prev?.pointerId !== e.pointerId) return;
    const d = follow(prev, e);
    update(null);
    if (!d.moved) return onToggle(d.id);
    if (d.zone === true) return throwCard(d);
    // Dropped on the pile but not allowed: it just goes back.
    if (d.zone) return;
    const next = orderFor(d);
    if (next.join() !== cards.join()) onReorder(next, d.id);
  };
  const onCancel = (e: React.PointerEvent) => {
    if (live.current?.pointerId === e.pointerId) update(null);
  };

  return (
    // No text selection or long-press callout: on iOS either one cancels the drag mid-flick.
    <div ref={ref} className="relative w-full touch-none select-none [-webkit-touch-callout:none]" style={{ height: layout.height }} data-testid="hand">
      {!drag?.moved &&
        groups.map((g) => {
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
              <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => onGroupTap?.(g.cards)} title="Select this group">
                {g.label}
              </button>
              <button
                type="button"
                className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/15 hover:text-white"
                onClick={() => onUngroup?.(g.cards)}
                aria-label={`Ungroup ${g.label}`}
                title="Ungroup"
              >
                ×
              </button>
            </div>
          );
        })}
      {/* Kept in hand order: moving the dragged card's element in the DOM would drop its pointer capture and end the drag. */}
      {cards.map((id) => {
        const i = posOf.get(id) ?? 0;
        const dragging = drag?.moved && drag.id === id;
        const hidden = pending === id;
        const p = slot(i);
        const lift = selected.has(id) ? -Math.round(ch * 0.16) : 0;
        let style: React.CSSProperties = { transform: `translate(${p.x}px, ${p.y + lift}px)`, left: 0, top: 0, zIndex: i + 1 };
        if (dragging) {
          const { x, y } = placed(drag!);
          style = { transform: `translate(${x}px, ${y}px) rotate(-3deg)`, left: 0, top: 0, zIndex: 100, transition: "none", willChange: "transform" };
        }
        if (hidden) style = { ...style, visibility: "hidden" };
        return (
          <button
            key={id}
            type="button"
            className="absolute cursor-grab outline-none transition-transform duration-200 ease-out focus-visible:[&>div]:ring-2 focus-visible:[&>div]:ring-gold active:cursor-grabbing"
            style={style}
            onPointerDown={(e) => onDown(e, id)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onCancel}
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
      {flight && (
        <div ref={ghost} className="pointer-events-none absolute left-0 top-0" style={{ transform: flight.from, zIndex: 100, willChange: "transform" }} aria-hidden>
          <PlayingCard id={flight.id} width={cw} maal={maal} className="shadow-lift" />
        </div>
      )}
    </div>
  );
}
