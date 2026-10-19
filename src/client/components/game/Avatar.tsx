import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

const GRADIENTS = [
  ["#f59e0b", "#b45309"],
  ["#ec4899", "#9d174d"],
  ["#3b82f6", "#1e3a8a"],
  ["#10b981", "#065f46"],
  ["#8b5cf6", "#4c1d95"],
  ["#ef4444", "#7f1d1d"],
  ["#14b8a6", "#134e4a"],
  ["#f97316", "#7c2d12"],
  ["#06b6d4", "#164e63"],
  ["#a3e635", "#3f6212"],
  ["#e879f9", "#701a75"],
  ["#facc15", "#713f12"],
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

interface Props {
  name: string;
  index: number;
  size?: number;
  isBot?: boolean;
  offline?: boolean;
  active?: boolean;
  /** 0..1 of the turn timer remaining; draws a ring. */
  progress?: number | null;
  className?: string;
}

export function Avatar({ name, index, size = 44, isBot, offline, active, progress, className }: Props) {
  const [a, b] = GRADIENTS[index % GRADIENTS.length];
  const r = size / 2 + 3;
  const circ = 2 * Math.PI * r;
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      {active && (
        <span className="absolute -inset-[5px] animate-pulse-ring rounded-full border-2 border-gold/70" aria-hidden />
      )}
      {progress != null && (
        <svg className="absolute -inset-[5px] -rotate-90" width={size + 10} height={size + 10} aria-hidden>
          <circle
            cx={size / 2 + 5}
            cy={size / 2 + 5}
            r={r}
            fill="none"
            stroke={progress < 0.25 ? "#e0565b" : "#f5b83d"}
            strokeWidth={3}
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progress)}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
      )}
      <div
        className={cn(
          "flex h-full w-full items-center justify-center rounded-full font-bold text-white shadow-md ring-2 ring-black/30",
          offline && "grayscale opacity-60",
        )}
        style={{ background: `linear-gradient(145deg, ${a}, ${b})`, fontSize: size * 0.36 }}
      >
        {initials(name)}
      </div>
      {isBot && (
        <span className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#1b2b25] text-gold ring-2 ring-background">
          <Bot className="h-3 w-3" />
        </span>
      )}
      {offline && !isBot && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-zinc-500 ring-2 ring-background" title="Offline" />
      )}
    </div>
  );
}
