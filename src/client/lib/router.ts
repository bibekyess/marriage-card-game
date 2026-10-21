import { useSyncExternalStore } from "react";

// Two routes are enough: "/" and "/t/CODE".
const listeners = new Set<() => void>();
window.addEventListener("popstate", () => listeners.forEach((l) => l()));

export function navigate(path: string, replace = false) {
  if (location.pathname === path) return;
  history[replace ? "replaceState" : "pushState"](null, "", path);
  listeners.forEach((l) => l());
}

export function usePath() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => location.pathname,
  );
}

export const tableCodeFrom = (path: string) => /^\/t\/([A-Za-z]{4})\/?$/.exec(path)?.[1].toUpperCase() ?? null;
export const tableUrl = (code: string) => `${location.origin}/t/${code}`;
