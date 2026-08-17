"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type * as React from "react";

/**
 * Theme selection — light/dark only, no OS-tracking "system" option
 * (product decision: the app always shows an explicit, user-picked theme).
 * An explicit choice (`setTheme("light" | "dark")`) persists across
 * sessions via `next-themes`' own localStorage key.
 *
 * `attribute="class"` toggles the `.dark` class consumed by
 * `tokens/semantic.css`. `suppressHydrationWarning` must also be set on
 * `<html>` in the root layout — `next-themes` injects an inline
 * pre-hydration script there to prevent a flash of the wrong theme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
    </NextThemesProvider>
  );
}
