import { PlayingCard } from "@/components/game/PlayingCard";
import { Avatar } from "@/components/game/Avatar";

// Dev-only visual check of cards and avatars (/__gallery in `npm run dev`).
export function DevGallery() {
  const ranks = ["A", "2", "5", "9", "10", "J", "Q", "K"];
  return (
    <div className="app-bg min-h-full space-y-6 p-6">
      {[84, 56, 34].map((w) => (
        <div key={w} className="flex flex-wrap gap-2">
          {["S", "H", "C", "D"].flatMap((s) => ranks.map((r) => <PlayingCard key={r + s + w} id={`${r}${s}0`} width={w} maal={w === 56 ? "9H0" : null} />))}
          {["JK0", "BH0"].map((id) => <PlayingCard key={id + w} id={id} width={w} maal={w === 56 ? "9H0" : null} />)}
          <PlayingCard width={w} />
        </div>
      ))}
      <div className="flex gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Avatar key={i} name={["Anisha", "Rohan", "Maya", "Sujan Rai", "Bibek", "Pema"][i]} index={i} isBot={i % 2 === 0} active={i === 1} offline={i === 3} />
        ))}
      </div>
    </div>
  );
}
