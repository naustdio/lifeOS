"use client";

import { useEffect } from "react";

/**
 * Registers `public/sw.js` at root scope — the whole architectural
 * prerequisite for adding Web Push later without re-architecting
 * (design.md §8). No offline data sync is wired up; this is shell +
 * static-asset caching only.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    // Dev-mode webpack chunk filenames aren't content-hashed like production's, so the SW's
    // cache-first `/_next/static/` strategy can serve a stale chunk after a hot-reload — causing
    // confusing runtime errors (e.g. a Server Action response parsed by mismatched old JS).
    if (process.env.NODE_ENV !== "production") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Registration failures should never block the app shell.
      });
    }
  }, []);

  return null;
}
