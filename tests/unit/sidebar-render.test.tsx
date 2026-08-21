import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Sidebar, SidebarNavItem } from "@/design-system/ui/sidebar";

/**
 * RTL render tests for the `Sidebar` primitive (change: tablet-web-sidebar-layout,
 * tasks.md PR2 1.1). Dumb, prop-driven chrome — no route data, no `usePathname` — the active
 * state is entirely controlled by the `active` prop (design.md decision 2).
 */
describe("Sidebar / SidebarNavItem", () => {
  afterEach(() => cleanup());

  it("exposes aria-current='page' on the active item and omits it on inactive items", () => {
    render(
      <Sidebar>
        <SidebarNavItem href="/finance" label="Finanzas" active>
          Finanzas
        </SidebarNavItem>
        <SidebarNavItem href="/cuentas" label="Cuentas">
          Cuentas
        </SidebarNavItem>
      </Sidebar>,
    );

    expect(screen.getByRole("link", { name: "Finanzas" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Cuentas" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("links to the destination's href", () => {
    render(
      <Sidebar>
        <SidebarNavItem href="/finance" label="Finanzas" active>
          Finanzas
        </SidebarNavItem>
      </Sidebar>,
    );

    expect(screen.getByRole("link", { name: "Finanzas" })).toHaveAttribute(
      "href",
      "/finance",
    );
  });
});
