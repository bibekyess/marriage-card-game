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

/** Court-card emblems: King's crown, Queen's tiara, Jack's fleur. Drawn in gold with a suit-coloured jewel. */
function CourtEmblem({ rank, color }: { rank: number; color: string }) {
  const gold = "url(#mg-gold)";
  return (
    <svg viewBox="0 0 40 40" className="h-[80%] w-[80%]" aria-hidden>
      {rank === 13 && (
        <>
          <path d="M6 30 L4 12 L13 20 L20 7 L27 20 L36 12 L34 30 Z" fill={gold} stroke="#8a5a00" strokeWidth="1" strokeLinejoin="round" />
          <rect x="6" y="30" width="28" height="4" rx="1.5" fill={gold} stroke="#8a5a00" strokeWidth="1" />
          {[4, 20, 36].map((x, i) => (
            <circle key={i} cx={x} cy={i === 1 ? 6 : 11} r="2.2" fill={gold} stroke="#8a5a00" strokeWidth=".8" />
          ))}
          <circle cx="20" cy="24" r="3" fill={color} />
        </>
      )}
      {rank === 12 && (
        <>
          <path d="M8 30 Q6 18 12 14 Q14 22 20 12 Q26 22 28 14 Q34 18 32 30 Z" fill={gold} stroke="#8a5a00" strokeWidth="1" strokeLinejoin="round" />
          <rect x="8" y="30" width="24" height="4" rx="1.5" fill={gold} stroke="#8a5a00" strokeWidth="1" />
          <circle cx="20" cy="9" r="2.6" fill={color} stroke="#8a5a00" strokeWidth=".8" />
          <circle cx="20" cy="23" r="2.4" fill={color} />
        </>
      )}
      {rank === 11 && (
        <>
          <path
            d="M20 5 C15 10 15 16 20 20 C25 16 25 10 20 5 Z M20 20 C14 15 7 17 8 24 C12 22 16 22 18 25 Z M20 20 C26 15 33 17 32 24 C28 22 24 22 22 25 Z"
            fill={gold}
            stroke="#8a5a00"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <rect x="13" y="26" width="14" height="3.5" rx="1.5" fill={gold} stroke="#8a5a00" strokeWidth=".9" />
          <path d="M18 29.5 L20 35 L22 29.5 Z" fill={color} />
        </>
      )}
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
            right: width * 0.09,
            bottom: width * 0.09,
            width: width * 0.58,
            height: h * 0.56,
            borderRadius: width * 0.06,
            background: red
              ? "linear-gradient(160deg,#fff6f1 0%,#fde6dd 100%)"
              : "linear-gradient(160deg,#f6f7fb 0%,#e4e8f1 100%)",
            boxShadow: `inset 0 0 0 1px ${red ? "#f0c9bf" : "#cdd3e0"}, inset 0 0 0 ${Math.max(2, width * 0.04)}px ${red ? "#fff6f1" : "#f6f7fb"}, inset 0 0 0 ${Math.max(2.6, width * 0.05)}px ${red ? "#f0c9bf" : "#cdd3e0"}`,
          }}
        >
          <CourtEmblem rank={c.rank} color={color} />
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
