import { useEffect, useState } from "react";
import { toast } from "sonner";
import { pref, setPref } from "./session";

// Full screen hides the browser bars so the table feels like a native app.
// iPhone Safari has no Fullscreen API for pages; there the answer is Add to Home Screen.

type WebkitDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?(): Promise<void> };
type WebkitEl = HTMLElement & { webkitRequestFullscreen?(): Promise<void> };
type LockableOrientation = ScreenOrientation & { lock?(o: string): Promise<void> };

const doc = document as WebkitDoc;

// Checked once at boot: once we go full screen, "display-mode: fullscreen" matches too.
const installed = (() => {
  try {
    return matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
})();

const isIPhone = /iPhone|iPod/.test(navigator.userAgent);

export const canFullscreen = () => !installed && !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
export const isFullscreen = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);

export async function enterFullscreen() {
  if (!canFullscreen() || isFullscreen()) return;
  const el = document.documentElement as WebkitEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else await el.webkitRequestFullscreen?.();
  } catch {
    return;
  }
  // Phones only allow locking orientation while full screen; desktops just refuse.
  try {
    await (screen.orientation as LockableOrientation | undefined)?.lock?.("landscape");
  } catch {}
}

export async function exitFullscreen() {
  if (!isFullscreen()) return;
  try {
    if (doc.exitFullscreen) await doc.exitFullscreen();
    else await doc.webkitExitFullscreen?.();
  } catch {}
}

/**
 * Toggle from the button or menu; remembers the choice for auto-enter.
 * Only this counts as a choice: Android also leaves full screen on an app switch.
 */
export function toggleFullscreen() {
  setPref("fullscreen", !isFullscreen());
  return isFullscreen() ? exitFullscreen() : enterFullscreen();
}

const smallTouchScreen = () => {
  try {
    return matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600;
  } catch {
    return false;
  }
};

/** Call from the tap that takes a phone player to a table (needs a user gesture). */
export function autoFullscreen() {
  if (smallTouchScreen() && pref("fullscreen", true)) void enterFullscreen();
}

/** Once per device, tell iPhone players how to get the app feel. */
export function iPhoneInstallTip() {
  if (!isIPhone || installed || pref("installTip", false)) return;
  setPref("installTip", true);
  toast.message("Play full screen", { description: "Tap Share, then Add to Home Screen.", duration: 8000 });
}

export function useFullscreen() {
  const [on, setOn] = useState(isFullscreen);
  useEffect(() => {
    const sync = () => setOn(isFullscreen());
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);
  return on;
}
