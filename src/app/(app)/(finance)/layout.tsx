import type * as React from "react";
import { ModuleNavPill } from "@/design-system/patterns/ModuleNavPill";
import { MODULE_NAV } from "@/shared/navigation/registry";

const financeModule = MODULE_NAV.find((module) => module.id === "finance")!;

/**
 * Finance module's nested layout (change: app-module-hub, spec
 * `module-architecture`: UI-Layer Route-Group Boundary). `(finance)` is a
 * Next.js route group — the parentheses add zero URL segments, so
 * `(finance)/movimientos/page.tsx` still serves `/movimientos`. This layout
 * is the sole owner of the Finance bottom nav, now sourced from the shared
 * registry via `ModuleNavPill` (change: tablet-web-sidebar-layout,
 * design.md decision 7) — rendered output and behavior are unchanged.
 */
export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <ModuleNavPill module={financeModule} />
    </>
  );
}
