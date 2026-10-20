import { useSyncExternalStore } from "react";
import { pref, setPref } from "./session";

// Visual themes are a per-viewer preference: each person picks the look they like.

export type ThemeId = "classic" | "royal" | "kite" | "glow";

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  tagline: string;
}

export const THEMES: ThemeInfo[] = [
  { id: "classic", name: "Classic Green", tagline: "Calm card-room felt" },
  { id: "royal", name: "Royal Red & Gold", tagline: "Traditional & warm · marigold and jamara" },
  { id: "kite", name: "Azure Kite Festival", tagline: "Vibrant & playful · changa and buntings" },
  { id: "glow", name: "Festival Glow", tagline: "Modern & elegant · golden bokeh" },
];

const listeners = new Set<() => void>();
let current: ThemeId = (() => {
  const t = pref<string>("theme", "classic");
  return THEMES.some((x) => x.id === t) ? (t as ThemeId) : "classic";
})();

const BROWSER_BAR: Record<ThemeId, string> = { classic: "#07120f", royal: "#1a0508", kite: "#061a2b", glow: "#050d0a" };

function apply() {
  document.documentElement.dataset.theme = current;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BROWSER_BAR[current]);
}
apply();

export function setTheme(t: ThemeId) {
  current = t;
  setPref("theme", t);
  apply();
  listeners.forEach((l) => l());
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
