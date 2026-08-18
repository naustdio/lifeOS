import type * as React from "react";
import { ModuleNavPill } from "@/design-system/patterns/ModuleNavPill";
import { MODULE_NAV } from "@/shared/navigation/registry";

const recipesModule = MODULE_NAV.find((module) => module.id === "recipes")!;

/**
 * Recipes module's nested layout (change: recipes-module, spec `module-architecture`:
 * UI-Layer Route-Group Boundary — same shape `(health)/layout.tsx`/`(finance)/layout.tsx`
 * already established). `(recipes)` is a Next.js route group: zero URL segments added, so
 * `(recipes)/recetas/page.tsx` still serves `/recetas`. Sole owner of Recipes' bottom nav,
 * now sourced from the shared registry via `ModuleNavPill` (change:
 * tablet-web-sidebar-layout, design.md decision 7) — rendered output and behavior are
 * unchanged. One tab only for this cycle — no overflow destinations, so `ModuleNavPill`
 * omits the "Más" trigger by construction.
 */
export default function RecipesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <ModuleNavPill module={recipesModule} />
    </>
  );
}
