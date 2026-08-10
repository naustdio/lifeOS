import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

/**
 * RTL smoke-render for the neutral module hub at `/` (change: app-module-hub, spec
 * `module-hub`: Neutral Hub Rendering at `/`, Static Module Cards, Hardcoded Module
 * Discovery). `HubPage` is a plain synchronous Server Component with zero data imports — no
 * Supabase/`api` mocking is needed, unlike `finance-dashboard-render.test.tsx`. Asserts the
 * Finance module card and its `href`, that no per-module data is displayed, and that the hub
 * renders none of the module-owned nav (`NavPill`/`FabMenu`/`OverflowMenu`) since those live
 * in `(finance)/layout.tsx`, not on this route.
 */

const { default: HubPage } = await import("@/app/(app)/page");

describe("HubPage — smoke render (app-module-hub)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the Finanzas module card linking to /finance", () => {
    render(<HubPage />);

    expect(screen.getByText("Finanzas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Finanzas" })).toHaveAttribute("href", "/finance");
  });

  it("renders the Salud module card linking to /salud (change: health-tracking)", () => {
    render(<HubPage />);

    expect(screen.getByText("Salud")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Salud" })).toHaveAttribute("href", "/salud");
  });

  it("renders no per-module data (balances, due counts)", () => {
    render(<HubPage />);

    expect(screen.queryByText(/Disponible/)).not.toBeInTheDocument();
    expect(screen.queryByText(/recurrentes por confirmar/)).not.toBeInTheDocument();
  });

  it("renders no NavPill/FabMenu/OverflowMenu — nav is module-owned", () => {
    render(<HubPage />);

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nuevo movimiento")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cuentas")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Inicio")).not.toBeInTheDocument();
  });
});
