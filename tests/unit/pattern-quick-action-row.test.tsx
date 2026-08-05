import { cleanup, render, screen } from "@testing-library/react";
import { Plus, Receipt, Target } from "lucide-react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { QuickActionRow } from "@/design-system/patterns/QuickActionRow";

describe("QuickActionRow", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders one link per action with the expected href", () => {
    render(
      <QuickActionRow
        actions={[
          { label: "Nueva transacción", icon: Receipt, href: "/movimientos" },
          { label: "Nueva cuenta", icon: Plus, href: "/cuentas/nueva" },
          { label: "Presupuestos", icon: Target, href: "/presupuestos" },
        ]}
      />,
    );

    const movements = screen.getByRole("link", { name: "Nueva transacción" });
    expect(movements).toHaveAttribute("href", "/movimientos");
    const accounts = screen.getByRole("link", { name: "Nueva cuenta" });
    expect(accounts).toHaveAttribute("href", "/cuentas/nueva");
    const budgets = screen.getByRole("link", { name: "Presupuestos" });
    expect(budgets).toHaveAttribute("href", "/presupuestos");
  });

  it("renders no disabled or placeholder items", () => {
    render(<QuickActionRow actions={[{ label: "Nueva cuenta", icon: Plus, href: "/cuentas/nueva" }]} />);
    expect(screen.queryByRole("button", { name: /disabled/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
