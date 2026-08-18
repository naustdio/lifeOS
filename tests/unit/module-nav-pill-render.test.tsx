import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModuleNavPill } from "@/design-system/patterns/ModuleNavPill";
import { MODULE_NAV } from "@/shared/navigation/registry";

/**
 * RTL render tests for `ModuleNavPill` (change: tablet-web-sidebar-layout,
 * tasks.md 2.2). Prop-driven: renders a `NavPill` from a `ModuleNav` entry —
 * primary destinations flank the central FAB, overflow destinations go
 * behind the "Más" trigger, and the trigger itself is omitted entirely when
 * a module has no overflow destinations (Recipes today).
 */
const financeModule = MODULE_NAV.find((m) => m.id === "finance")!;
const recipesModule = MODULE_NAV.find((m) => m.id === "recipes")!;

describe("ModuleNavPill", () => {
  afterEach(() => cleanup());

  it("renders the module's primary destinations and FAB link from the ModuleNav prop", () => {
    render(<ModuleNavPill module={financeModule} />);

    expect(screen.getByLabelText("Inicio")).toHaveAttribute("href", "/finance");
    expect(screen.getByLabelText("Cuentas")).toHaveAttribute("href", "/cuentas");
    expect(screen.getByLabelText("Nuevo movimiento")).toHaveAttribute(
      "href",
      "/movimientos",
    );
  });

  it("exposes overflow destinations behind the Más trigger when overflow is non-empty", () => {
    render(<ModuleNavPill module={financeModule} />);

    fireEvent.click(screen.getByRole("button", { name: /más|more/i }));

    expect(screen.getByRole("link", { name: "Presupuestos" })).toHaveAttribute(
      "href",
      "/presupuestos",
    );
    expect(screen.getByRole("link", { name: "Calendario" })).toHaveAttribute(
      "href",
      "/calendario",
    );
  });

  it("omits the OverflowMenu trigger entirely when the module has no overflow destinations", () => {
    render(<ModuleNavPill module={recipesModule} />);

    expect(screen.queryByRole("button", { name: /más|more/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Recetas")).toHaveAttribute("href", "/recetas");
    expect(screen.getByRole("link", { name: "Nueva receta" })).toHaveAttribute(
      "href",
      "/recetas",
    );
  });
});
