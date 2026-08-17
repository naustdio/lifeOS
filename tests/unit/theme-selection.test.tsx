import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../src/design-system/theme-provider";
import { ThemeToggle } from "../../src/design-system/ui/theme-toggle";

/**
 * Covers the design-system's "Theme Selection" requirement end-to-end through `next-themes`,
 * backed by real `localStorage`/`document.documentElement` state in jsdom — light/dark only, no
 * OS-tracking "system" option (product decision: the app always shows an explicit, user-picked
 * theme).
 */

function mockMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" ? prefersDark : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderApp() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("Theme Selection", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark", "light");
  });

  afterEach(() => {
    cleanup();
  });

  it("scenario: first visit defaults to light, ignoring an OS dark preference", async () => {
    mockMatchMedia(true);
    renderApp();

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
    expect(screen.queryByRole("radio", { name: "Sistema" })).not.toBeInTheDocument();
  });

  it("scenario: picking dark applies it and persists it across a fresh render", async () => {
    renderApp();

    act(() => {
      screen.getByRole("radio", { name: "Oscuro" }).click();
    });

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
    expect(window.localStorage.getItem("theme")).toBe("dark");

    // Simulate "the next session": re-render with a fresh tree, same storage.
    cleanup();
    renderApp();
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("scenario: picking light applies it and persists it across a fresh render", async () => {
    renderApp();

    act(() => {
      screen.getByRole("radio", { name: "Oscuro" }).click();
    });
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    act(() => {
      screen.getByRole("radio", { name: "Claro" }).click();
    });
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
    expect(window.localStorage.getItem("theme")).toBe("light");

    cleanup();
    renderApp();
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });
});
