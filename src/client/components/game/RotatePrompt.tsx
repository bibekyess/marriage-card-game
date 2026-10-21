import { useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { smallTouchScreen } from "@/lib/fullscreen";
import { pref, setPref } from "@/lib/session";

/**
 * Landscape is the default on phones: the table needs the width once there are
 * several players. Browsers (iPhone Safari especially) can't force it, so we ask.
 * Players who prefer portrait can say so once; it's remembered on this device.
 */
export function RotatePrompt({ portrait }: { portrait: boolean }) {
  const [ok, setOk] = useState(() => pref("portrait", false));
  if (!portrait || ok || !smallTouchScreen()) return null;
  const stay = () => {
    setPref("portrait", true);
    setOk(true);
  };
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/90 p-8 text-center backdrop-blur-sm" role="dialog" aria-label="Turn your phone sideways">
      <Smartphone className="h-16 w-16 text-gold motion-safe:animate-rotate-hint" aria-hidden />
      <div className="space-y-1.5">
        <p className="text-lg font-bold text-gold">Turn your phone sideways</p>
        <p className="text-sm text-white/70">The table fits much better in landscape, especially with more players.</p>
      </div>
      <Button variant="ghost" className="text-white/60" onClick={stay}>
        Keep playing in portrait
      </Button>
    </div>
  );
}
