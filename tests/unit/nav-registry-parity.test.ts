import { describe, expect, it } from "vitest";
import { MODULE_NAV } from "@/shared/navigation/registry";

/**
 * Registry parity regression guard (change: tablet-web-sidebar-layout,
 * tasks.md 1.3, design.md Testing Strategy). Frozen literal of today's
 * per-module href/label/placement lists — captured directly from
 * `(finance|health|recipes)/layout.tsx` BEFORE their refactor — asserted
 * against the registry-derived output. If this test ever fails, either the
 * registry drifted from production reality, or someone is about to
 * (accidentally) change the mobile nav's public contract.
 */
const FROZEN_DESTINATIONS = {
  finance: [
    { href: "/finance", label: "Inicio", placement: "primary" },
    { href: "/cuentas", label: "Cuentas", placement: "primary" },
    { href: "/presupuestos", label: "Presupuestos", placement: "overflow" },
    { href: "/recurrentes", label: "Recurrentes", placement: "overflow" },
    { href: "/categorias", label: "Categorías", placement: "overflow" },
    { href: "/calendario", label: "Calendario", placement: "overflow" },
  ],
  health: [
    { href: "/salud", label: "Eventos", placement: "primary" },
    { href: "/signos", label: "Signos vitales", placement: "primary" },
    { href: "/nutricion", label: "Nutrición", placement: "overflow" },
    { href: "/perfil", label: "Perfil", placement: "overflow" },
  ],
  recipes: [{ href: "/recetas", label: "Recetas", placement: "primary" }],
} as const;

const FROZEN_MODULES = {
  finance: { id: "finance", label: "Finanzas", href: "/finance" },
  health: { id: "health", label: "Salud", href: "/salud" },
  recipes: { id: "recipes", label: "Recetas", href: "/recetas" },
  shoppingList: { id: "shopping-list", label: "Lista de compras", href: "/lista-de-compras" },
} as const;

function destinationsOf(id: "finance" | "health" | "recipes") {
  const moduleNav = MODULE_NAV.find((m) => m.id === id);
  if (!moduleNav) throw new Error(`MODULE_NAV is missing module "${id}"`);
  return moduleNav.destinations.map(({ href, label, placement }) => ({
    href,
    label,
    placement,
  }));
}

describe("MODULE_NAV registry parity (regression guard)", () => {
  it("matches today's Finance nav href/label/placement list exactly", () => {
    expect(destinationsOf("finance")).toEqual(FROZEN_DESTINATIONS.finance);
  });

  it("matches today's Health nav href/label/placement list exactly", () => {
    expect(destinationsOf("health")).toEqual(FROZEN_DESTINATIONS.health);
  });

  it("matches today's Recipes nav href/label/placement list exactly (single tab, no overflow)", () => {
    expect(destinationsOf("recipes")).toEqual(FROZEN_DESTINATIONS.recipes);
  });

  it("exposes the hub-facing id/label/href for every module in hub order", () => {
    const hubFacing = MODULE_NAV.map(({ id, label, href }) => ({ id, label, href }));
    expect(hubFacing).toEqual([
      FROZEN_MODULES.finance,
      FROZEN_MODULES.health,
      FROZEN_MODULES.recipes,
      FROZEN_MODULES.shoppingList,
    ]);
  });
});
