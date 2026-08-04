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
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Registration failures should never block the app shell.
      });
    }
  }, []);

  return null;
}
