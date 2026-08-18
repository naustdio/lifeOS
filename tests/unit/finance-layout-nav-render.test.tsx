import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import FinanceLayout from "@/app/(app)/(finance)/layout";

// RTL approval render, mirrors `health-layout-nav-render.test.tsx` (tasks.md 2.4). Captures
// today's Finance nav behavior BEFORE `(finance)/layout.tsx` is refactored onto the shared
// registry + `ModuleNavPill` (change: tablet-web-sidebar-layout).
describe("FinanceLayout nav — approval render (registry + ModuleNavPill refactor)", () => {
  afterEach(() => cleanup());

  it("renders the direct Inicio and Cuentas links", () => {
    render(<FinanceLayout>{null}</FinanceLayout>);

    expect(screen.getByLabelText("Inicio")).toHaveAttribute("href", "/finance");
    expect(screen.getByLabelText("Cuentas")).toHaveAttribute("href", "/cuentas");
  });

  it("renders the central FAB linking to /movimientos with its default accessible name", () => {
    render(<FinanceLayout>{null}</FinanceLayout>);

    expect(screen.getByLabelText("Nuevo movimiento")).toHaveAttribute(
      "href",
      "/movimientos",
    );
    expect(screen.getByRole("button", { name: "Agregar movimiento" })).toBeInTheDocument();
  });

  it("the overflow menu offers all four Finance destinations", () => {
    render(<FinanceLayout>{null}</FinanceLayout>);

    fireEvent.click(screen.getByRole("button", { name: /más|more/i }));

    expect(screen.getByRole("link", { name: "Presupuestos" })).toHaveAttribute(
      "href",
      "/presupuestos",
    );
    expect(screen.getByRole("link", { name: "Recurrentes" })).toHaveAttribute(
      "href",
      "/recurrentes",
    );
    expect(screen.getByRole("link", { name: "Categorías" })).toHaveAttribute(
      "href",
      "/categorias",
    );
    expect(screen.getByRole("link", { name: "Calendario" })).toHaveAttribute(
      "href",
      "/calendario",
    );
  });
});
