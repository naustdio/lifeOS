import type * as React from "react";
import { ModuleNavPill } from "@/design-system/patterns/ModuleNavPill";
import { MODULE_NAV } from "@/shared/navigation/registry";

const healthModule = MODULE_NAV.find((module) => module.id === "health")!;

/**
 * Health module's nested layout (change: health-tracking, spec `module-architecture`:
 * UI-Layer Route-Group Boundary — same shape `(finance)/layout.tsx` already established).
 * `(health)` is a Next.js route group: zero URL segments added, so `(health)/salud/page.tsx`
 * still serves `/salud`. Sole owner of Health's bottom nav, now sourced from the shared
 * registry via `ModuleNavPill` (change: tablet-web-sidebar-layout, design.md decision 7) —
 * rendered output and behavior are unchanged.
 */
export default function HealthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <ModuleNavPill module={healthModule} />
    </>
  );
}
