import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { navigate, tableCodeFrom, usePath } from "@/lib/router";
import { sessionFor } from "@/lib/session";
import { detachTable, resume, useGame } from "@/lib/store";
import { unlockAudio } from "@/lib/sound";
import { Home } from "@/screens/Home";
import { JoinScreen } from "@/screens/JoinScreen";
import { Lobby } from "@/screens/Lobby";
import { TableScreen } from "@/screens/TableScreen";
import { Loading } from "@/screens/Loading";
import { DevGallery } from "@/screens/DevGallery";
import { DevThemes } from "@/components/theme/DevThemes";

export function App() {
  const path = usePath();
  const code = tableCodeFrom(path);
  const game = useGame();

  useEffect(() => {
    // iOS can suspend audio again (e.g. after the phone locks), so unlock on every gesture.
    const unlock = () => unlockAudio();
    // Coming back from another app (e.g. Google Meet) is the usual end of an audio interruption.
    const back = () => document.visibilityState === "visible" && unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", back);
    };
  }, []);

  // Opening /t/CODE with a saved seat puts you straight back at the table.
  useEffect(() => {
    if (code && game.session?.code !== code && sessionFor(code)) resume(code);
  }, [code, game.session?.code]);

  // Leaving a table's page (Back to Home, or another table's link): stop counting as
  // present there, but keep the seat so the link brings you back.
  const lastCode = useRef(code);
  useEffect(() => {
    if (path !== "/" && !code && !(import.meta.env.DEV && path.startsWith("/__"))) navigate("/", true);
    if (lastCode.current && lastCode.current !== code) detachTable(lastCode.current);
    lastCode.current = code;
  }, [path, code, game.session]);

  let screen: React.ReactNode;
  if (import.meta.env.DEV && path === "/__gallery") screen = <DevGallery />;
  else if (import.meta.env.DEV && path === "/__themes") screen = <DevThemes />;
  else if (!code) screen = <Home />;
  else if (game.session?.code !== code) screen = <JoinScreen code={code} lost={game.lost?.code === code ? game.lost.error : null} />;
  else if (!game.view) screen = <Loading text="Taking your seat…" />;
  else if (game.view.status === "lobby") screen = <Lobby view={game.view} />;
  else screen = <TableScreen view={game.view} connected={game.connected && game.live} />;

  return (
    <TooltipProvider delayDuration={300}>
      {screen}
      <Toaster />
    </TooltipProvider>
  );
}
