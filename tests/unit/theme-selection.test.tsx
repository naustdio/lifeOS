import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../src/design-system/theme-provider";
import { ThemeToggle } from "../../src/design-system/ui/theme-toggle";

/**
 * Covers all three scenarios of the design-system spec's "Theme Selection"
 * requirement end-to-end through `next-themes`, backed by real
 * `localStorage`/`document.documentElement` state in jsdom.
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

  it("scenario: first visit follows the OS dark preference", async () => {
    mockMatchMedia(true);
    renderApp();

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("scenario: a manual light override wins over an OS dark preference and persists", async () => {
    mockMatchMedia(true);
    renderApp();

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

    // Simulate "the next session": re-render with a fresh tree, same storage.
    cleanup();
    renderApp();
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  it("scenario: returning to system-following clears the stored override", async () => {
    mockMatchMedia(true);
    renderApp();

    act(() => {
      screen.getByRole("radio", { name: "Claro" }).click();
    });
    await waitFor(() => {
      expect(window.localStorage.getItem("theme")).toBe("light");
    });

    act(() => {
      screen.getByRole("radio", { name: "Sistema" }).click();
    });

    await waitFor(() => {
      expect(window.localStorage.getItem("theme")).toBe("system");
    });
    // Tracks the OS preference again (mocked as dark).
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });
});
