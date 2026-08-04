"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type * as React from "react";

/**
 * Theme selection (design-system spec "Theme Selection", all three
 * scenarios):
 * 1. First visit follows the OS preference (`defaultTheme="system"`).
 * 2. An explicit override (`setTheme("light" | "dark")`) persists across
 *    sessions via `next-themes`' own localStorage key and wins over the OS
 *    preference.
 * 3. Returning to "system" (`setTheme("system")`) clears the stored
 *    override and the theme again tracks the OS preference.
 *
 * `attribute="class"` toggles the `.dark` class consumed by
 * `tokens/semantic.css`. `suppressHydrationWarning` must also be set on
 * `<html>` in the root layout — `next-themes` injects an inline
 * pre-hydration script there to prevent a flash of the wrong theme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
