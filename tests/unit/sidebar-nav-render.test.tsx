import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RTL render tests for `SidebarNav` (change: tablet-web-sidebar-layout, tasks.md PR2 1.3).
 * `"use client"` pattern: owns `usePathname`, picks the active module via longest-prefix match
 * (`active-route.ts`), renders only that module's destinations plus a hub link — `null` when no
 * module matches (e.g. at `/`, design.md decision 4).
 *
 * `modules` is passed as pre-serialized icon elements (design.md decision 5): the real caller,
 * `(app)/layout.tsx`, is a Server Component and must map `LucideIcon` refs to rendered elements
 * before they cross the Server→Client boundary into this `"use client"` pattern — a bare
 * component reference fails RSC serialization (see `OverflowMenu.tsx`).
 */

let mockPathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

const { SidebarNav } = await import("@/design-system/patterns/SidebarNav");
const { MODULE_NAV } = await import("@/shared/navigation/registry");

const SERIALIZED_MODULES = MODULE_NAV.map((module) => ({
  id: module.id,
  href: module.href,
  label: module.label,
  destinations: module.destinations.map((destination) => ({
    href: destination.href,
    label: destination.label,
    icon: <destination.icon className="h-5 w-5" aria-hidden />,
  })),
}));

describe("SidebarNav", () => {
  afterEach(() => cleanup());

  it("renders null when no module matches the current route (hub)", () => {
    mockPathname = "/";
    const { container } = render(<SidebarNav modules={SERIALIZED_MODULES} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only the active module's destinations plus a hub link on a Finance route", () => {
    mockPathname = "/finance";
    render(<SidebarNav modules={SERIALIZED_MODULES} />);

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("href", "/finance");
    expect(screen.getByRole("link", { name: "Cuentas" })).toHaveAttribute("href", "/cuentas");
    expect(screen.getByRole("link", { name: "Presupuestos" })).toHaveAttribute(
      "href",
      "/presupuestos",
    );

    expect(screen.queryByRole("link", { name: "Eventos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Recetas" })).not.toBeInTheDocument();
  });

  it("marks the active destination with aria-current='page' via longest-prefix match", () => {
    mockPathname = "/cuentas/1/edit";
    render(<SidebarNav modules={SERIALIZED_MODULES} />);

    expect(screen.getByRole("link", { name: "Cuentas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("renders a hub link back to /", () => {
    mockPathname = "/salud";
    render(<SidebarNav modules={SERIALIZED_MODULES} />);

    expect(screen.getByRole("link", { name: /LifeOS|Inicio del hub|hub/i })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
