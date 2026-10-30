"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID || null;

/**
 * Pages left open on a phone (or saved to the home screen) keep running the
 * version they first loaded. When the app comes back into view, this checks
 * whether a newer version is live and offers a one-tap refresh.
 */
export function VersionWatcher() {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (!BUILD) return;
    let last = 0;
    async function check() {
      if (document.visibilityState !== "visible" || Date.now() - last < 30_000) return;
      last = Date.now();
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { version } = (await res.json()) as { version: string | null };
        if (version && version !== BUILD) setOutdated(true);
      } catch {
        // Offline or signed out: try again next time.
      }
    }
    void check();
    const timer = setInterval(check, 5 * 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!outdated) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[95] flex justify-center p-3" role="status">
      <button
        className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-on-brand shadow-xl shadow-black/40"
        onClick={() => window.location.reload()}
        type="button"
      >
        <RefreshCw className="h-4 w-4" /> A new version is ready — tap to refresh
      </button>
    </div>
  );
}
