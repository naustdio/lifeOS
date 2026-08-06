import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RTL smoke-render for `OverflowMenu` (design.md §11, design-system spec "Overflow ('Más')
 * Navigation Entry Point", change: finance-recurring R-022): both `Presupuestos` and
 * `Recurrentes` are reachable through the "Más" menu, in both light and dark theme classes —
 * the reachability regression for the removed direct `Presupuestos` slot.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const { OverflowMenu } = await import("@/design-system/patterns/OverflowMenu");
const { Target, Repeat } = await import("lucide-react");

const ITEMS = [
  { href: "/presupuestos", label: "Presupuestos", icon: Target },
  { href: "/recurrentes", label: "Recurrentes", icon: Repeat },
];

describe.each([
  ["light", "light"],
  ["dark", "dark"],
])("OverflowMenu — reachability at 375px, %s theme (R-022)", (_name, themeClass) => {
  beforeEach(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(themeClass);
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("light", "dark");
  });

  it("opens an overflow menu listing both secondary destinations", () => {
    render(<OverflowMenu items={ITEMS} />);

    const trigger = screen.getByRole("button", { name: "Más" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /Presupuestos/ })).toHaveAttribute("href", "/presupuestos");
    expect(screen.getByRole("link", { name: /Recurrentes/ })).toHaveAttribute("href", "/recurrentes");
  });

  it("closes on Escape", () => {
    render(<OverflowMenu items={ITEMS} />);
    fireEvent.click(screen.getByRole("button", { name: "Más" }));
    expect(screen.getByRole("link", { name: /Presupuestos/ })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("link", { name: /Presupuestos/ })).not.toBeInTheDocument();
  });
});
