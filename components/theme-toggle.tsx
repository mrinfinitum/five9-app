"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";
export const THEME_KEY = "f9-theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const readTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

/** Floating light/dark switch in the bottom-right corner. Remembers the choice in this browser. */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribe, readTheme, () => null);
  if (!theme) return null;
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      aria-label={`Switch to ${next} mode`}
      className="fixed bottom-4 right-4 z-[70] grid h-11 w-11 place-items-center rounded-full border border-line bg-panel text-neutral-200 shadow-lg shadow-black/30 transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        document.documentElement.style.colorScheme = next;
        try {
          window.localStorage.setItem(THEME_KEY, next);
        } catch {
          // Private browsing: the switch still works for this visit.
        }
      }}
      title={`Switch to ${next} mode`}
      type="button"
    >
      {theme === "dark" ? <Sun aria-hidden="true" className="h-5 w-5" /> : <Moon aria-hidden="true" className="h-5 w-5" />}
    </button>
  );
}
