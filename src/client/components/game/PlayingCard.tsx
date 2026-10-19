import { memo } from "react";
import { card, CardId, isRed, rankLabel, SUIT_NAME, SUIT_SYMBOL } from "../../../shared/cards";
import { cn } from "@/lib/utils";
import { MAAL_NAME, MAAL_TAG } from "@/lib/hints";
import { maalKind } from "../../../shared/cards";

interface Props {
  id?: CardId | null; // null/undefined = face down
  width?: number;
  maal?: CardId | null;
  selected?: boolean;
  dim?: boolean;
  glow?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

function Crown({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[44%] w-[44%]" aria-hidden>
      <path
        d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8z"
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path d="M5 20h14" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

/** A vector playing card. Size is driven by `width`; everything scales from it. */
export const PlayingCard = memo(function PlayingCard({ id, width = 56, maal, selected, dim, glow, className, style }: Props) {
  const h = Math.round(width * 1.42);
  const base: React.CSSProperties = { width, height: h, borderRadius: Math.max(5, width * 0.11), ...style };

  if (!id) {
    return (
      <div
        className={cn("card-back relative shrink-0 select-none shadow-card", className)}
        style={base}
        aria-label="Face-down card"
      >
        <div className="absolute inset-[7%] rounded-[inherit] border border-white/25" />
        <svg viewBox="0 0 40 56" className="absolute inset-[14%] h-[72%] w-[72%] opacity-80" aria-hidden>
          <path d="M20 4 L36 28 L20 52 L4 28 Z" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.4" />
          <path d="M20 14 L29 28 L20 42 L11 28 Z" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1" />
        </svg>
      </div>
    );
  }

  const c = card(id);
  const red = isRed(c.suit);
  const color = red ? "#c8232f" : "#16181d";
  const kind = maalKind(id, maal);
  const face = c.rank > 10;
  const label = rankLabel(c.rank);
  const sym = SUIT_SYMBOL[c.suit];
  const rankSize = width * (label === "10" ? 0.34 : 0.38);

  return (
    <div
      className={cn(
        "playing-card relative shrink-0 select-none overflow-hidden bg-[#fbfaf6] shadow-card transition-[transform,box-shadow,opacity] duration-150",
        selected && "ring-2 ring-gold shadow-lift",
        glow && "ring-2 ring-gold/80 shadow-[0_0_18px_rgba(245,184,61,.55)]",
        dim && "opacity-55",
        className,
      )}
      style={{ ...base, color }}
      aria-label={`${label} of ${SUIT_NAME[c.suit]}${kind ? `, ${MAAL_NAME[kind]}` : ""}`}
      role="img"
    >
      <div className="absolute inset-0 rounded-[inherit] border border-black/10" />
      <div className="absolute flex flex-col items-center leading-none" style={{ left: width * 0.07, top: width * 0.07 }}>
        <span className="font-extrabold tracking-tight" style={{ fontSize: rankSize, letterSpacing: label === "10" ? -1 : 0 }}>
          {label}
        </span>
        <span style={{ fontSize: width * 0.3, marginTop: width * 0.02 }}>{sym}</span>
      </div>
      {face ? (
        <div
          className="absolute flex items-center justify-center rounded-[4px]"
          style={{
            right: width * 0.08,
            bottom: width * 0.1,
            width: width * 0.56,
            height: h * 0.52,
            background: red ? "linear-gradient(160deg,#fff4ef,#fbe3dc)" : "linear-gradient(160deg,#f3f4f8,#e3e6ee)",
            border: `1px solid ${red ? "#efc6bd" : "#cfd3dd"}`,
          }}
        >
          <Crown color={c.rank === 11 ? "#b8860b" : color} />
          <span className="absolute bottom-[6%] font-extrabold opacity-80" style={{ fontSize: width * 0.2 }}>
            {sym}
          </span>
        </div>
      ) : (
        <span className="absolute leading-none" style={{ right: width * 0.1, bottom: width * 0.1, fontSize: width * 0.62 }}>
          {sym}
        </span>
      )}
      {kind && (
        <span
          className="absolute rounded-full bg-gradient-to-b from-[#ffd36e] to-[#e9a224] font-extrabold text-[#3b2a05] shadow"
          style={{
            right: width * 0.06,
            top: width * 0.06,
            fontSize: Math.max(9, width * 0.2),
            lineHeight: 1,
            padding: `${width * 0.04}px ${width * 0.07}px`,
          }}
          title={MAAL_NAME[kind]}
        >
          {MAAL_TAG[kind]}
        </span>
      )}
    </div>
  );
});
