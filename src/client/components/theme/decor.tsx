import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ThemeId } from "../../lib/themes";

// Festival artwork for the visual themes. Everything here is presentational inline SVG / CSS.
// Callers decide stacking: these overlays are `absolute` and `pointer-events-none`.

export const THEME_FELT: Record<ThemeId, { felt: string; rim: string; page: string }> = {
  classic: {
    felt: "radial-gradient(ellipse at 50% 42%, #1f9a6b 0%, #157a54 38%, #0d5a3d 70%, #0a4430 100%)",
    rim: "#0b3b2b",
    page: "radial-gradient(120% 80% at 50% 45%, #0b2219 0%, #06110d 70%)",
  },
  royal: {
    felt: "radial-gradient(ellipse at 50% 42%, #9e1b32 0%, #7e1228 38%, #5c0a1a 70%, #3a0611 100%)",
    rim: "#4a0a16",
    page: "radial-gradient(120% 80% at 50% 45%, #2a0a10 0%, #1a0508 70%)",
  },
  kite: {
    felt: "radial-gradient(ellipse at 50% 42%, #2a86bd 0%, #1f6fa3 30%, #0f4d7a 68%, #0a3556 100%)",
    rim: "#0a2a4a",
    page: "radial-gradient(120% 80% at 50% 45%, #0f3a66 0%, #08203d 72%)",
  },
  glow: {
    felt: "radial-gradient(ellipse at 50% 42%, #17614a 0%, #104a38 38%, #0a3427 70%, #072419 100%)",
    rim: "#072016",
    page: "radial-gradient(120% 80% at 50% 45%, #0a1f18 0%, #040d09 72%)",
  },
};

const GOLD = "#e6c15a";
const sid = (raw: string) => raw.replace(/[^a-zA-Z0-9_-]/g, "");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rad = (deg: number) => (deg * Math.PI) / 180;

/* ------------------------------------------------------------------ */
/* Measuring frame: lets garlands/buntings be built in real pixels so   */
/* they span the full width with whole swags and no gaps.               */
/* ------------------------------------------------------------------ */

interface Box {
  w: number;
  h: number;
}

function Frame({ children }: { children: (b: Box) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>({ w: 844, h: 390 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const upd = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setBox((p) => (Math.abs(p.w - r.width) < 0.5 && Math.abs(p.h - r.height) < 0.5 ? p : { w: r.width, h: r.height }));
      }
    };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ containerType: "size" } as CSSProperties}
    >
      {children(box)}
    </div>
  );
}

function swagLayout(b: Box, compact: boolean) {
  const target = compact ? clamp(b.w / 3, 34, 60) : clamp(Math.min(b.w / 6, b.h * 0.3), 76, 150);
  const n = Math.max(2, Math.round(b.w / target));
  return { n, sw: b.w / n };
}

/** Point + unit tangent on a drooping swag (quadratic bezier from (x0,0) to (x0+sw,0), sag `d` at the middle). */
function swag(x0: number, sw: number, d: number, t: number) {
  const u = 1 - t;
  const x = u * u * x0 + 2 * u * t * (x0 + sw / 2) + t * t * (x0 + sw);
  const y = 2 * u * t * (2 * d);
  const dx = 2 * u * (sw / 2) + 2 * t * (sw / 2);
  const dy = 2 * u * (2 * d) - 2 * t * (2 * d);
  const len = Math.hypot(dx, dy) || 1;
  return { x, y, tx: dx / len, ty: dy / len };
}

const swagPath = (x0: number, sw: number, d: number) => `M${x0} 0 Q${x0 + sw / 2} ${2 * d} ${x0 + sw} 0`;

/* ------------------------------------------------------------------ */
/* Shared motifs                                                        */
/* ------------------------------------------------------------------ */

const MARIGOLD_PALETTES = [
  ["#ee7d0c", "#fb9f16", "#ffc83a", "#c85a06"],
  ["#f59a14", "#ffb81f", "#ffdc5e", "#df7208"],
  ["#e96f0a", "#f7a416", "#ffd248", "#bd4f05"],
];

/** Layered Sayapatri (marigold) in unit radius, scaled by r. */
function Marigold({ x, y, r, pal = 0, rot = 0 }: { x: number; y: number; r: number; pal?: number; rot?: number }) {
  const p = MARIGOLD_PALETTES[pal % MARIGOLD_PALETTES.length];
  const ring = (n: number, dist: number, pr: number, fill: string, off: number) =>
    Array.from({ length: n }, (_, k) => {
      const a = rad(off + (360 / n) * k);
      return (
        <circle
          key={k}
          cx={Math.sin(a) * dist}
          cy={-Math.cos(a) * dist}
          r={pr}
          fill={fill}
          stroke="rgba(90,30,0,.28)"
          strokeWidth={0.035}
        />
      );
    });
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${r})`}>
      {ring(10, 0.6, 0.4, p[0], 0)}
      {ring(8, 0.42, 0.34, p[1], 18)}
      {ring(6, 0.22, 0.26, p[2], 0)}
      <circle r={0.13} fill={p[3]} />
    </g>
  );
}

const GRASS = ["#2f8f3e", "#55b04a", "#237a35", "#7cc35a", "#3fa047"];

/** One tapered, curved blade of barley grass hanging from (0,0) at angle `deg` from straight-down. */
function Blade({ deg, len, bw, fill, bend = 1 }: { deg: number; len: number; bw: number; fill: string; bend?: number }) {
  const a = rad(deg);
  const tx = Math.sin(a) * len;
  const ty = Math.cos(a) * len;
  const cx = tx * 0.45 + ty * 0.12 * bend;
  const cy = ty * 0.5 - tx * 0.12 * bend;
  return (
    <path
      d={`M${-bw} 0 Q${cx - bw * 0.5} ${cy} ${tx} ${ty} Q${cx + bw * 0.5} ${cy} ${bw} 0Z`}
      fill={fill}
    />
  );
}

/** A tuft of jamara hanging from (x,y); angles are degrees from straight down. */
function Jamara({
  x,
  y,
  len,
  from = -26,
  to = 26,
  count = 7,
  seed = 0,
}: {
  x: number;
  y: number;
  len: number;
  from?: number;
  to?: number;
  count?: number;
  seed?: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: count }, (_, k) => {
        const f = count === 1 ? 0.5 : k / (count - 1);
        const deg = from + (to - from) * f;
        const l = len * (0.78 + 0.22 * Math.abs(Math.sin((k + seed) * 2.1)));
        return (
          <Blade key={k} deg={deg} len={l} bw={len * 0.045} fill={GRASS[(k + seed) % GRASS.length]} bend={k % 2 ? 1 : -1} />
        );
      })}
      <rect x={-len * 0.1} y={-len * 0.04} width={len * 0.2} height={len * 0.1} rx={len * 0.03} fill="#d9a21b" />
    </g>
  );
}

/** Gold line-art mandala, radius 50, centred on the origin. */
function Mandala({ stroke = GOLD, fillOpacity = 0.0, sw = 0.9 }: { stroke?: string; fillOpacity?: number; sw?: number }) {
  const rot = (n: number, off = 0) => Array.from({ length: n }, (_, k) => off + (360 / n) * k);
  return (
    <g fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <circle r={48.5} />
      <circle r={45.5} strokeDasharray="0.1 3.4" strokeWidth={sw * 1.8} />
      {rot(24).map((a) => (
        <path key={a} d="M0 -37.5 Q3.8 -42 0 -46.5 Q-3.8 -42 0 -37.5" transform={`rotate(${a})`} />
      ))}
      <circle r={36.5} />
      {rot(12, 15).map((a) => (
        <path
          key={a}
          d="M0 -23.5 Q8.5 -30 0 -36 Q-8.5 -30 0 -23.5"
          transform={`rotate(${a})`}
          fill={stroke}
          fillOpacity={fillOpacity}
        />
      ))}
      {rot(12).map((a) => (
        <circle key={a} cx={0} cy={-30} r={1.1} fill={stroke} stroke="none" transform={`rotate(${a})`} />
      ))}
      <circle r={22} />
      {rot(8).map((a) => (
        <path key={a} d="M0 -8.5 Q5.5 -14.5 0 -20.5 Q-5.5 -14.5 0 -8.5" transform={`rotate(${a})`} />
      ))}
      <circle r={7.5} />
      <circle r={3.2} fill={stroke} fillOpacity={0.9} stroke="none" />
    </g>
  );
}

/** Line-art marigold (gold outline only), radius 50. */
function MarigoldLine({ stroke = GOLD, sw = 1.3 }: { stroke?: string; sw?: number }) {
  const petal = (len: number, w: number, from: number) =>
    `M0 ${-from} C${w} ${-from - (len - from) * 0.25} ${w} ${-len * 0.88} 0 ${-len} C${-w} ${-len * 0.88} ${-w} ${-from - (len - from) * 0.25} 0 ${-from}`;
  const ring = (n: number, off: number, len: number, w: number, from: number) =>
    Array.from({ length: n }, (_, k) => (
      <path key={k} d={petal(len, w, from)} transform={`rotate(${off + (360 / n) * k})`} />
    ));
  return (
    <g fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {ring(14, 0, 50, 6.5, 18)}
      {ring(10, 18, 38, 5.5, 11)}
      {ring(7, 0, 25, 6, 5)}
      <circle r={3.4} />
    </g>
  );
}

function KiteMark({
  x,
  y,
  s,
  rot = 0,
  c,
  outline = "rgba(10,30,60,.35)",
  spar = "rgba(255,255,255,.65)",
  ow = 0.05,
}: {
  x: number;
  y: number;
  s: number;
  rot?: number;
  c: [string, string, string, string];
  outline?: string;
  spar?: string;
  ow?: number;
}) {
  // Diamond with a cross: T(top) R B L and centre C.
  const T = [0, -0.78];
  const R = [0.52, -0.1];
  const B = [0, 0.92];
  const L = [-0.52, -0.1];
  const C = [0, -0.1];
  const tri = (a: number[], b: number[], k: number[], fill: string) => (
    <polygon points={`${a} ${b} ${k}`} fill={fill} />
  );
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      {tri(T, R, C, c[0])}
      {tri(R, B, C, c[1])}
      {tri(B, L, C, c[2])}
      {tri(L, T, C, c[3])}
      <polygon points={`${T} ${R} ${B} ${L}`} fill="none" stroke={outline} strokeWidth={ow} strokeLinejoin="round" />
      <path d={`M0 ${T[1]} V${B[1]} M${L[0]} ${L[1]} H${R[0]}`} stroke={spar} strokeWidth={ow * 0.8} />
    </g>
  );
}

const KITE_COLORS = ["#ff8a1f", "#ffcb2e", "#e63946", "#14b2a6", "#f472b6"];

/* ------------------------------------------------------------------ */
/* Table decor                                                          */
/* ------------------------------------------------------------------ */

function RoyalDecor({ box, compact }: { box: Box; compact: boolean }) {
  const { n, sw } = swagLayout(box, compact);
  const d = sw * 0.27;
  const r = sw * 0.092;
  const N = 8;
  const slots = Array.from({ length: n }, (_, i) =>
    Array.from({ length: N + 1 }, (_, k) => ({ i, k, p: swag(i * sw, sw, d, k / N) })),
  );
  const isTuft = (k: number) => k === 0 || k === N || k === N / 2;
  return (
    <svg className="absolute left-0 top-0" width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
      <g strokeLinecap="round" fill="none" stroke="#7a4b0e" strokeWidth={Math.max(1, sw * 0.012)}>
        {Array.from({ length: n }, (_, i) => (
          <path key={i} d={swagPath(i * sw, sw, d)} />
        ))}
      </g>
      {slots.flat().filter((s) => !isTuft(s.k)).map((s) => (
        <Marigold key={`${s.i}-${s.k}`} x={s.p.x} y={s.p.y + r * 0.15} r={r} pal={s.i + s.k} rot={(s.i * 53 + s.k * 41) % 360} />
      ))}
      {slots.flat().filter((s) => isTuft(s.k) && s.k === N / 2).map((s) => (
        <g key={`t-${s.i}`}>
          <Marigold x={s.p.x} y={s.p.y} r={r * 0.9} pal={2} rot={20} />
          <Jamara x={s.p.x} y={s.p.y + r * 0.6} len={sw * 0.24} count={7} seed={s.i} />
        </g>
      ))}
      {slots.flat().filter((s) => s.k === 0 && s.i > 0).map((s) => (
        <g key={`j-${s.i}`}>
          <Marigold x={s.p.x} y={s.p.y} r={r * 0.9} pal={1} rot={0} />
          <Jamara x={s.p.x} y={s.p.y + r * 0.6} len={sw * 0.28} count={7} seed={s.i + 2} />
        </g>
      ))}
      {/* corner bunches */}
      <g>
        <Jamara x={sw * 0.04} y={0} len={sw * 0.62} from={-8} to={52} count={11} seed={1} />
        <Marigold x={sw * 0.06} y={r * 0.2} r={r * 1.05} pal={0} rot={10} />
        <Jamara x={box.w - sw * 0.04} y={0} len={sw * 0.62} from={-52} to={8} count={11} seed={4} />
        <Marigold x={box.w - sw * 0.06} y={r * 0.2} r={r * 1.05} pal={1} rot={-10} />
      </g>
    </svg>
  );
}

function KiteDecor({ box, compact }: { box: Box; compact: boolean }) {
  const { n, sw } = swagLayout(box, compact);
  const flagW = Math.max(sw * 0.115, compact ? 5 : 9);
  const flagH = flagW * 1.3;

  const row = (offset: number, count: number, droop: number, shift: number, scale: number, key: string, opacity = 1) => {
    const fw = flagW * scale;
    const fh = flagH * scale;
    const perSwag = Math.max(3, Math.round((sw * 1.05) / (fw * 1.35)));
    return (
      <g key={key} opacity={opacity}>
        {Array.from({ length: count }, (_, i) => {
          const x0 = offset + i * sw;
          return (
            <g key={i}>
              <path d={swagPath(x0, sw, droop)} fill="none" stroke="#fff3cf" strokeOpacity={0.9} strokeWidth={Math.max(1, sw * 0.011)} />
              {Array.from({ length: perSwag }, (_, j) => {
                const p = swag(x0, sw, droop, (j + 0.5) / perSwag);
                const ax = p.x - p.tx * (fw / 2);
                const ay = p.y - p.ty * (fw / 2);
                const bx = p.x + p.tx * (fw / 2);
                const by = p.y + p.ty * (fw / 2);
                return (
                  <polygon
                    key={j}
                    points={`${ax},${ay} ${bx},${by} ${p.x},${p.y + fh}`}
                    fill={KITE_COLORS[(i * perSwag + j + shift) % KITE_COLORS.length]}
                    stroke="rgba(8,30,60,.25)"
                    strokeWidth={0.7}
                    strokeLinejoin="round"
                  />
                );
              })}
            </g>
          );
        })}
      </g>
    );
  };

  const s = clamp(Math.min(box.w, box.h) * 0.07, compact ? 7 : 20, 38);
  const tail = (cx: number, cy: number, len: number, flip: number, col: string) => {
    const a = s * 0.28 * flip;
    return (
      <g>
        <path
          d={`M${cx} ${cy} q${a} ${len / 6} 0 ${len / 3} t0 ${len / 3} t0 ${len / 3}`}
          fill="none"
          stroke="#fff3cf"
          strokeOpacity={0.9}
          strokeWidth={Math.max(0.8, s * 0.04)}
          strokeLinecap="round"
        />
        {[0.28, 0.55, 0.82].map((f, i) => (
          <g key={i} transform={`translate(${cx + (i % 2 ? -a * 0.15 : a * 0.15)} ${cy + len * f})`}>
            <polygon points={`0,0 ${-s * 0.2},${-s * 0.11} ${-s * 0.2},${s * 0.11}`} fill={KITE_COLORS[(i * 2 + col.length) % 5]} />
            <polygon points={`0,0 ${s * 0.2},${-s * 0.11} ${s * 0.2},${s * 0.11}`} fill={KITE_COLORS[(i * 2 + 1 + col.length) % 5]} />
          </g>
        ))}
      </g>
    );
  };
  const kite = (cx: number, cy: number, k: number, rot: number, c: [string, string, string, string], key: string, flip: number) => (
    <g key={key} transform={`rotate(${rot} ${cx} ${cy})`}>
      {tail(cx, cy + 0.92 * k, k * 2.6, flip, c[0])}
      <KiteMark x={cx} y={cy} s={k} c={c} />
    </g>
  );

  const topPad = flagH + sw * 0.2;
  const ky = topPad + s * 0.9;
  return (
    <svg className="absolute left-0 top-0" width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
      {row(-sw / 2, n + 1, sw * 0.13, 2, 0.8, "back", 0.85)}
      {row(0, n, sw * 0.17, 0, 1, "front")}
      {kite(s * 1.55, ky + s * 0.2, s * 1.05, -12, ["#ff8a1f", "#ffcb2e", "#e63946", "#ffcb2e"], "k1", 1)}
      {kite(s * 3.6, ky - s * 0.15, s * 0.72, 14, ["#14b2a6", "#ffffff", "#f472b6", "#ffffff"], "k2", -1)}
      {kite(box.w - s * 1.55, ky + s * 0.35, s * 1.05, 11, ["#e63946", "#ffcb2e", "#14b2a6", "#ff8a1f"], "k3", -1)}
      {!compact && kite(box.w - s * 3.7, ky - s * 0.2, s * 0.68, -13, ["#ffcb2e", "#ffffff", "#ff8a1f", "#ffffff"], "k4", 1)}
    </svg>
  );
}

// Deterministic pseudo-random bokeh layout (edge-biased) so renders are stable.
const BOKEH = Array.from({ length: 18 }, (_, i) => {
  const f = (n: number) => {
    const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const edge = i % 3 !== 2;
  const left = i % 2 === 0;
  const x = edge ? (left ? f(1) * 15 : 100 - f(1) * 15) : 20 + f(1) * 60;
  const y = edge ? f(2) * 100 : i % 2 ? f(2) * 12 : 88 + f(2) * 12;
  const size = 3 + Math.pow(f(3), 1.5) * 11;
  return {
    x,
    y,
    size,
    o: 0.3 + f(4) * 0.5,
    dur: 16 + f(5) * 16,
    delay: -f(6) * 24,
    dx: (f(7) - 0.5) * 7,
    dy: (f(8) - 0.5) * 9,
  };
});

const GLOW_CSS = `
@keyframes mk-bokeh-drift {
  0%, 100% { transform: translate(0,0) scale(1); opacity: var(--o); }
  50% { transform: translate(var(--dx), var(--dy)) scale(1.1); opacity: calc(var(--o) * .5); }
}
.mk-bokeh { animation: mk-bokeh-drift var(--d) ease-in-out var(--dl) infinite; will-change: transform, opacity; }
@media (prefers-reduced-motion: reduce) { .mk-bokeh { animation: none; } }
`;

function GlowDecor({ compact }: { compact: boolean }) {
  const gid = sid(useId());
  const corner = compact ? "clamp(16px, 30cqmin, 40px)" : "clamp(64px, 26cqmin, 130px)";
  return (
    <>
      <style>{GLOW_CSS}</style>
      {BOKEH.map((b, i) => (
        <div
          key={i}
          className="mk-bokeh absolute rounded-full"
          style={
            {
              left: `calc(${b.x}% - ${b.size / 2}cqmin)`,
              top: `calc(${b.y}% - ${b.size / 2}cqmin)`,
              width: `${b.size}cqmin`,
              height: `${b.size}cqmin`,
              background:
                "radial-gradient(circle, rgba(255,226,150,.65) 0%, rgba(255,208,110,.45) 48%, rgba(255,196,90,.7) 64%, rgba(255,190,80,0) 72%)",
              "--o": b.o,
              "--d": `${b.dur}s`,
              "--dl": `${b.delay}s`,
              "--dx": `${b.dx}cqmin`,
              "--dy": `${b.dy}cqmin`,
            } as CSSProperties
          }
        />
      ))}
      <svg
        className="absolute"
        style={{ left: "-3cqmin", bottom: "-3cqmin", width: corner, aspectRatio: "1", opacity: 0.5 }}
        viewBox="-56 -56 112 112"
        aria-hidden="true"
      >
        <g transform="rotate(8)">
          <MarigoldLine sw={1.2} />
        </g>
      </svg>
      <svg
        className="absolute"
        style={{ right: "-3cqmin", top: "-3cqmin", width: corner, aspectRatio: "1", opacity: 0.5 }}
        viewBox="-56 -56 112 112"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`${gid}g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f6e3a1" />
            <stop offset="1" stopColor="#d4a63a" />
          </linearGradient>
        </defs>
        <g transform="rotate(-14)">
          <MarigoldLine stroke={`url(#${gid}g)`} sw={1.2} />
        </g>
      </svg>
    </>
  );
}

export function TableDecor({ theme, compact = false }: { theme: ThemeId; compact?: boolean }) {
  if (theme === "classic") return null;
  return (
    <Frame>
      {(box) =>
        theme === "royal" ? (
          <RoyalDecor box={box} compact={compact} />
        ) : theme === "kite" ? (
          <KiteDecor box={box} compact={compact} />
        ) : (
          <GlowDecor compact={compact} />
        )
      }
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Felt pattern                                                         */
/* ------------------------------------------------------------------ */

const SCRIPT_FONT = '"Great Vibes", "Snell Roundhand", "Apple Chancery", "Palatino Linotype", Georgia, serif';

export function FeltPattern({ theme }: { theme: ThemeId }) {
  const gid = sid(useId());
  if (theme === "classic") return null;
  const wrap = "absolute inset-0 overflow-hidden pointer-events-none";

  if (theme === "royal") {
    return (
      <div aria-hidden="true" className={wrap}>
        <svg className="absolute inset-0" width="100%" height="100%" aria-hidden="true">
          <defs>
            <pattern id={`${gid}p`} width="64" height="64" patternUnits="userSpaceOnUse">
              <g fill="none" stroke={GOLD} strokeOpacity={0.11} strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round">
                <path d="M32 2 L62 32 L32 62 L2 32 Z" />
                <circle cx="32" cy="32" r="11" />
                {Array.from({ length: 8 }, (_, k) => (
                  <path key={k} d="M0 -4 Q3.6 -8.5 0 -13 Q-3.6 -8.5 0 -4" transform={`translate(32 32) rotate(${k * 45})`} />
                ))}
                <circle cx="32" cy="32" r="2" />
                {[
                  [2, 2],
                  [62, 2],
                  [2, 62],
                  [62, 62],
                ].map(([x, y]) => (
                  <g key={`${x}${y}`}>
                    <circle cx={x} cy={y} r="5" />
                    <circle cx={x} cy={y} r="1.6" />
                  </g>
                ))}
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${gid}p)`} />
        </svg>
        <svg
          className="absolute"
          style={{ left: "50%", top: "50%", height: "96%", aspectRatio: "1", transform: "translate(-50%,-50%)" }}
          viewBox="-50 -50 100 100"
          aria-hidden="true"
        >
          <g opacity={0.12}>
            <Mandala sw={0.7} fillOpacity={0.12} />
          </g>
        </svg>
      </div>
    );
  }

  if (theme === "kite") {
    return (
      <div aria-hidden="true" className={wrap}>
        <svg className="absolute inset-0" width="100%" height="100%" aria-hidden="true">
          <defs>
            <pattern id={`${gid}k`} width="64" height="80" patternUnits="userSpaceOnUse">
              {[
                [16, 22, -10],
                [48, 62, 12],
              ].map(([x, y, r]) => (
                <g key={`${x}`} transform={`translate(${x} ${y}) rotate(${r})`} fill="#ffffff" fillOpacity={0.065}>
                  <polygon points="0,-13 8,-2 0,15 -8,-2" />
                  <path d="M0 15 q4 5 0 10 t0 10" fill="none" stroke="#fff" strokeOpacity={0.07} strokeWidth={1} />
                </g>
              ))}
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${gid}k)`} />
        </svg>
      </div>
    );
  }

  // glow
  return (
    <div aria-hidden="true" className={wrap}>
      <svg
        className="absolute left-0 w-full"
        style={{ top: "50%", height: "36%" }}
        viewBox="0 0 800 260"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`${gid}w`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f8e7ab" />
            <stop offset="0.55" stopColor="#d9ac45" />
            <stop offset="1" stopColor="#b98b2c" />
          </linearGradient>
        </defs>
        <g
          fill={`url(#${gid}w)`}
          opacity={0.35}
          fontFamily={SCRIPT_FONT}
          textAnchor="middle"
          style={{ fontSize: 118 }}
        >
          <text x="400" y="108">Vijaya Dashami</text>
          <text x="400" y="226">Subhakamana</text>
        </g>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card back                                                            */
/* ------------------------------------------------------------------ */

export function CardBackArt({ theme }: { theme: ThemeId }) {
  const id = sid(useId());
  const base = "absolute inset-0 w-full h-full pointer-events-none block";
  const common = { viewBox: "0 0 100 142", preserveAspectRatio: "xMidYMid slice", className: base, "aria-hidden": true as const };

  if (theme === "royal") {
    return (
      <svg {...common}>
        <defs>
          <radialGradient id={`${id}b`} cx="50%" cy="45%" r="75%">
            <stop offset="0" stopColor="#7a0f1f" />
            <stop offset="1" stopColor="#3d0710" />
          </radialGradient>
        </defs>
        <rect width="100" height="142" fill={`url(#${id}b)`} />
        <rect x="4.5" y="4.5" width="91" height="133" rx="5" fill="none" stroke={GOLD} strokeWidth="1.7" />
        <rect x="8.5" y="8.5" width="83" height="125" rx="3" fill="none" stroke={GOLD} strokeOpacity="0.6" strokeWidth="0.8" />
        {[
          [16, 16],
          [84, 16],
          [16, 126],
          [84, 126],
        ].map(([x, y]) => (
          <path key={`${x}${y}`} d={`M${x} ${y - 4.5} L${x + 3.2} ${y} L${x} ${y + 4.5} L${x - 3.2} ${y} Z`} fill={GOLD} fillOpacity="0.85" />
        ))}
        <g transform="translate(50 71) scale(0.69)">
          <Mandala sw={1.5} fillOpacity={0.28} />
        </g>
      </svg>
    );
  }

  if (theme === "kite") {
    const navy = "#1b2f5e";
    return (
      <svg {...common}>
        <defs>
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff8e8" />
            <stop offset="1" stopColor="#cfe7f6" />
          </linearGradient>
          <pattern id={`${id}p`} x="6" y="6" width="30" height="40" patternUnits="userSpaceOnUse">
            <KiteMark x={8} y={12} s={9} rot={-12} c={["#ff8a1f", "#ffcb2e", "#e63946", "#ffcb2e"]} outline={navy} spar="rgba(255,255,255,.8)" ow={0.07} />
            <path d="M7 21 q3 3 0 6" stroke={navy} strokeWidth="0.8" fill="none" strokeLinecap="round" />
            <KiteMark x={23} y={32} s={9} rot={14} c={["#14b2a6", "#ffffff", "#e63946", "#ff8a1f"]} outline={navy} spar="rgba(255,255,255,.8)" ow={0.07} />
            <path d="M24 41 q3 3 0 6" stroke={navy} strokeWidth="0.8" fill="none" strokeLinecap="round" />
          </pattern>
        </defs>
        <rect width="100" height="142" fill={`url(#${id}b)`} />
        <rect x="6" y="6" width="88" height="130" rx="3" fill={`url(#${id}p)`} />
        <rect x="6" y="6" width="88" height="130" rx="3" fill="none" stroke={navy} strokeOpacity="0.55" strokeWidth="0.8" />
        <rect x="3" y="3" width="94" height="136" rx="5" fill="none" stroke={navy} strokeWidth="2" />
      </svg>
    );
  }

  if (theme === "glow") {
    return (
      <svg {...common}>
        <defs>
          <radialGradient id={`${id}b`} cx="50%" cy="45%" r="75%">
            <stop offset="0" stopColor="#0f3d2e" />
            <stop offset="1" stopColor="#072319" />
          </radialGradient>
        </defs>
        <rect width="100" height="142" fill={`url(#${id}b)`} />
        <rect x="5" y="5" width="90" height="132" rx="5" fill="none" stroke={GOLD} strokeWidth="1.5" />
        <g transform="translate(0 3)" fill="none" stroke={GOLD} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          {/* leaves */}
          {[-72, -46, 46, 72].map((a) => (
            <path key={a} d="M0 0 Q-8.5 -13 0 -27 Q8.5 -13 0 0Z" transform={`translate(50 62) rotate(${a})`} fill={GOLD} fillOpacity="0.12" />
          ))}
          <path d="M0 0 Q-7 -11 0 -23 Q7 -11 0 0Z" transform="translate(50 62)" fill={GOLD} fillOpacity="0.12" />
          {/* coconut */}
          <ellipse cx="50" cy="45" rx="8.2" ry="9.6" fill="#072319" />
          <path d="M45 42.5 q5 -3.8 10 0" strokeWidth="1.2" />
          {/* pot */}
          <path d="M35 62 H65 V68 H35 Z" fill="#072319" />
          <path d="M38 68 C26 73 25 99 38 107 Q50 113 62 107 C75 99 74 73 62 68" fill={GOLD} fillOpacity="0.1" />
          <path d="M30 83 Q50 92 70 83" strokeWidth="1.2" />
          <path d="M50 89 l3.4 4.6 l-3.4 4.6 l-3.4 -4.6 Z" strokeWidth="1.1" />
          <path d="M40 111 H60" strokeWidth="1.6" />
        </g>
        {[
          [14, 14],
          [86, 14],
          [14, 128],
          [86, 128],
        ].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" fill={GOLD} fillOpacity="0.8" />
        ))}
      </svg>
    );
  }

  // classic
  return (
    <svg {...common}>
      <defs>
        <radialGradient id={`${id}b`} cx="50%" cy="45%" r="75%">
          <stop offset="0" stopColor="#14634a" />
          <stop offset="1" stopColor="#0b3b2b" />
        </radialGradient>
      </defs>
      <rect width="100" height="142" fill={`url(#${id}b)`} />
      <rect x="5" y="5" width="90" height="132" rx="5" fill="none" stroke="#f5b83d" strokeOpacity="0.85" strokeWidth="1.6" />
      <path d="M50 41 L77 71 L50 101 L23 71 Z" fill="none" stroke="#f5b83d" strokeWidth="2" strokeLinejoin="round" />
      <path d="M50 56 L64 71 L50 86 L36 71 Z" fill="#f5b83d" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Maal accent                                                          */
/* ------------------------------------------------------------------ */

export function MaalAccent({ theme, size = 28 }: { theme: ThemeId; size?: number }) {
  const id = sid(useId());
  const svg = (children: ReactNode) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="pointer-events-none block"
      style={{ overflow: "visible" }}
    >
      {children}
    </svg>
  );
  if (theme === "royal") {
    return svg(
      <g transform="translate(16 29) scale(1 -1)">
        {[-30, -15, 0, 15, 30, -7, 8].map((a, k) => (
          <g key={a} transform="scale(1 -1)">
            <g transform={`rotate(${180 + a})`}>
              <Blade deg={0} len={k < 5 ? 24 : 19} bw={1.4} fill={GRASS[k % GRASS.length]} bend={k % 2 ? 1 : -1} />
            </g>
          </g>
        ))}
        <rect x="-3.6" y="2.4" width="7.2" height="3.4" rx="1.2" fill="#e6b422" transform="scale(1 -1)" />
      </g>,
    );
  }
  if (theme === "kite") {
    return svg(
      <g>
        <path d="M13 21 q-3 2.5 0 5 t0 5" stroke="#fff3cf" strokeWidth="1" fill="none" strokeLinecap="round" />
        <KiteMark x={16} y={12} s={13} rot={12} c={["#ff8a1f", "#ffcb2e", "#e63946", "#14b2a6"]} ow={0.06} />
      </g>,
    );
  }
  if (theme === "glow") {
    return svg(
      <g>
        <defs>
          <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff1b8" />
            <stop offset="1" stopColor="#e0a933" />
          </linearGradient>
        </defs>
        <path d="M14 3 Q16 14 27 16 Q16 18 14 29 Q12 18 1 16 Q12 14 14 3Z" fill={`url(#${id}s)`} />
        <path d="M25 3 Q25.8 7 30 8 Q25.8 9 25 13 Q24.2 9 20 8 Q24.2 7 25 3Z" fill={`url(#${id}s)`} opacity="0.85" />
      </g>,
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Theme swatch                                                         */
/* ------------------------------------------------------------------ */

export function ThemeSwatch({ theme }: { theme: ThemeId }) {
  const f = THEME_FELT[theme];
  return (
    <div aria-hidden="true" className="relative h-full w-full overflow-hidden pointer-events-none" style={{ background: f.page }}>
      <div
        className="absolute overflow-hidden"
        style={{
          left: "7%",
          right: "7%",
          top: "16%",
          bottom: "12%",
          borderRadius: "50%",
          background: f.felt,
          boxShadow: `0 0 0 3px ${f.rim}, 0 0 0 4px rgba(255,255,255,.12)`,
        }}
      >
        <FeltPattern theme={theme} />
      </div>
      <div
        className="absolute left-1/2 overflow-hidden"
        style={{
          top: "34%",
          width: "13%",
          aspectRatio: "1 / 1.42",
          transform: "translateX(-50%)",
          borderRadius: 3,
          border: "1px solid rgba(255,255,255,.85)",
          boxShadow: "0 1px 3px rgba(0,0,0,.45)",
        }}
      >
        <CardBackArt theme={theme} />
      </div>
      <TableDecor theme={theme} compact />
    </div>
  );
}
