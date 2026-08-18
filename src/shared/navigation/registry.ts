import type { LucideIcon } from "lucide-react";
import {
  Apple,
  BookOpen,
  CalendarDays,
  HeartPulse,
  Home,
  Layers,
  LineChart,
  Repeat,
  Target,
  UserRound,
  Wallet,
} from "lucide-react";

/**
 * Single source of truth for module navigation (change:
 * tablet-web-sidebar-layout, design.md decision 1 + Interfaces/Contracts).
 * `app → shared` is the only allowed cross-boundary import direction for
 * this data per `eslint-plugin-boundaries`; `design-system` may depend on
 * `shared` too (consumed by `ModuleNavPill`/`SidebarNav`), but nothing in
 * `shared` may import back into `app` or `design-system`.
 *
 * Data only — zero React, zero `usePathname`. See `active-route.ts` for the
 * pure active-route resolver consumed by the sidebar (PR 2).
 */

export type NavDestination = {
  href: string;
  label: string;
  /** A `LucideIcon` component reference — safe here because `registry.ts`
   * itself never crosses a Server→Client boundary; only rendered elements
   * (built from these refs) may cross it (design.md decision 5). */
  icon: LucideIcon;
  /** Mobile pill grouping only — `SidebarNav` (PR 2) renders every
   * destination regardless of placement. */
  placement: "primary" | "overflow";
};

export type ModuleNav = {
  id: "finance" | "health" | "recipes";
  label: string;
  href: string;
  icon: LucideIcon;
  /** Mobile-only central FAB; `SidebarNav` (PR 2) ignores this field.
   * `buttonLabel` overrides `FabMenu`'s own accessible-name default
   * ("Agregar movimiento") when the module needs a different one (Health,
   * Recipes); omitted for Finance, which relies on `FabMenu`'s default —
   * this preserves each module's exact current accessible name. */
  fab: { href: string; label: string; buttonLabel?: string };
  destinations: NavDestination[];
};

export const MODULE_NAV: readonly ModuleNav[] = [
  {
    id: "finance",
    label: "Finanzas",
    href: "/finance",
    icon: Wallet,
    fab: { href: "/movimientos", label: "Nuevo movimiento" },
    destinations: [
      { href: "/finance", label: "Inicio", icon: Home, placement: "primary" },
      { href: "/cuentas", label: "Cuentas", icon: Wallet, placement: "primary" },
      {
        href: "/presupuestos",
        label: "Presupuestos",
        icon: Target,
        placement: "overflow",
      },
      {
        href: "/recurrentes",
        label: "Recurrentes",
        icon: Repeat,
        placement: "overflow",
      },
      {
        href: "/categorias",
        label: "Categorías",
        icon: Layers,
        placement: "overflow",
      },
      {
        href: "/calendario",
        label: "Calendario",
        icon: CalendarDays,
        placement: "overflow",
      },
    ],
  },
  {
    id: "health",
    label: "Salud",
    href: "/salud",
    icon: HeartPulse,
    fab: { href: "/salud", label: "Nuevo evento", buttonLabel: "Nuevo evento" },
    destinations: [
      { href: "/salud", label: "Eventos", icon: HeartPulse, placement: "primary" },
      {
        href: "/signos",
        label: "Signos vitales",
        icon: LineChart,
        placement: "primary",
      },
      { href: "/nutricion", label: "Nutrición", icon: Apple, placement: "overflow" },
      { href: "/perfil", label: "Perfil", icon: UserRound, placement: "overflow" },
    ],
  },
  {
    id: "recipes",
    label: "Recetas",
    href: "/recetas",
    icon: BookOpen,
    fab: { href: "/recetas", label: "Nueva receta", buttonLabel: "Nueva receta" },
    destinations: [
      { href: "/recetas", label: "Recetas", icon: BookOpen, placement: "primary" },
    ],
  },
];
