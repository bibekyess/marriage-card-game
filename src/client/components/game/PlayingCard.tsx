import { memo } from "react";
import { card, CardId, isRed, maalKind, PrintedKind, printedKind, rankLabel, SUIT_NAME, SUIT_SYMBOL } from "../../../shared/cards";
import { cn } from "@/lib/utils";
import { isPointless, MAAL_NAME, MAAL_TAG } from "@/lib/hints";
import { CardBackArt } from "@/components/theme/decor";
import { useTheme } from "@/lib/themes";

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

/** Printed card art: a jester's hat for the Joker, a little ghost for the Bhoot. */
function PrintedEmblem({ kind }: { kind: PrintedKind }) {
  const gold = "url(#mg-gold)";
  return (
    <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
      {kind === "joker" ? (
        <>
          {/* Floppy three-horned cap in red and black, so it never reads as a King's crown. */}
          <path d="M11 30 C11 22 8 16 3 18 C5 10 14 10 18 22 Z" fill="#c8232f" stroke="#7a1018" strokeWidth="1" strokeLinejoin="round" />
          <path d="M29 30 C29 22 32 16 37 18 C35 10 26 10 22 22 Z" fill="#c8232f" stroke="#7a1018" strokeWidth="1" strokeLinejoin="round" />
          <path d="M14 30 C14 18 17 10 20 4 C23 10 26 18 26 30 Z" fill="#16181d" stroke="#000" strokeWidth="1" strokeLinejoin="round" />
          <rect x="8" y="29" width="24" height="5" rx="2" fill={gold} stroke="#8a5a00" strokeWidth=".9" />
          {[[3, 18], [20, 4], [37, 18]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2.6" fill={gold} stroke="#8a5a00" strokeWidth=".8" />
          ))}
        </>
      ) : (
        <>
          <path d="M20 5 C12 5 8 11 8 19 L8 35 L12.5 31.5 L16 35 L20 31.5 L24 35 L27.5 31.5 L32 35 L32 19 C32 11 28 5 20 5 Z" fill="#f4f0ff" stroke="#5b2a86" strokeWidth="1.6" strokeLinejoin="round" />
          <ellipse cx="15.5" cy="18" rx="2.4" ry="3.2" fill="#2b1442" />
          <ellipse cx="24.5" cy="18" rx="2.4" ry="3.2" fill="#2b1442" />
          <ellipse cx="20" cy="25.5" rx="2.6" ry="2" fill="#2b1442" />
        </>
      )}
    </svg>
  );
}

/** A vector playing card. Size is driven by `width`; everything scales from it. */
export const PlayingCard = memo(function PlayingCard({ id, width = 56, maal, selected, dim, glow, className, style }: Props) {
  const theme = useTheme();
  const h = Math.round(width * 1.42);
  const base: React.CSSProperties = { width, height: h, borderRadius: Math.max(5, width * 0.11), ...style };

  if (!id) {
    return (
      <div
        className={cn("relative shrink-0 select-none overflow-hidden border-2 border-[#fbfaf6] shadow-card", className)}
        style={base}
        aria-label="Face-down card"
      >
        <CardBackArt theme={theme} width={width} />
      </div>
    );
  }

  const kind = maalKind(id, maal);
  const badge = kind && (
    // Under the index, on the left edge: stays visible when the hand overlaps cards.
    <span
      className={cn(
        "rounded-full font-extrabold shadow",
        // Wild cards that score nothing: silver. Point cards: gold.
        isPointless(kind) ? "bg-gradient-to-b from-[#f1f3f6] to-[#b8bfca] text-[#2b3038]" : "bg-gradient-to-b from-[#ffd36e] to-[#e9a224] text-[#3b2a05]",
      )}
      style={{
        marginTop: width * 0.04,
        fontSize: Math.max(9, width * 0.2),
        lineHeight: 1,
        padding: `${width * 0.03}px ${width * 0.05}px`,
      }}
      title={MAAL_NAME[kind]}
    >
      {MAAL_TAG[kind]}
    </span>
  );

  const printed = printedKind(id);
  if (printed) {
    const ink = printed === "bhoot" ? "#5b2a86" : "#16181d";
    const name = printed === "bhoot" ? "Bhoot" : "Joker";
    return (
      <div
        className={cn(
          "playing-card relative shrink-0 select-none overflow-hidden bg-[#fbfaf6] shadow-card transition-[transform,box-shadow,opacity] duration-150",
          selected && "ring-2 ring-gold shadow-lift",
          glow && "ring-2 ring-gold/80 shadow-[0_0_18px_rgba(245,184,61,.55)]",
          dim && "opacity-55",
          className,
        )}
        style={{ ...base, color: ink }}
        aria-label={kind ? `${name}, wild card` : `${name}, wild once you see the maal`}
        role="img"
      >
        <div className="absolute inset-0 rounded-[inherit] border border-black/10" />
        <div className="absolute z-10 flex flex-col items-center leading-none" style={{ left: width * 0.07, top: width * 0.07 }}>
          {/* A small emblem in the corner: the part still visible when the hand overlaps cards. */}
          <span style={{ width: width * 0.34, height: width * 0.34 }}>
            <PrintedEmblem kind={printed} />
          </span>
          <span className="font-extrabold uppercase" style={{ fontSize: Math.max(6, width * 0.13), marginTop: width * 0.02 }}>
            {printed === "bhoot" ? "Bhoot" : "Joker"}
          </span>
          {badge}
        </div>
        <div className="absolute" style={{ right: width * 0.08, bottom: width * 0.1, width: width * 0.62, height: width * 0.62 }}>
          <PrintedEmblem kind={printed} />
        </div>
      </div>
    );
  }

  const c = card(id);
  const red = isRed(c.suit);
  const color = red ? "#c8232f" : "#16181d";
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
      <div className="absolute z-10 flex flex-col items-center leading-none" style={{ left: width * 0.07, top: width * 0.07 }}>
        <span className="font-extrabold tracking-tight" style={{ fontSize: rankSize, letterSpacing: label === "10" ? -1 : 0 }}>
          {label}
        </span>
        <span style={{ fontSize: width * 0.3, marginTop: width * 0.02 }}>{sym}</span>
        {badge}
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
    </div>
  );
});
