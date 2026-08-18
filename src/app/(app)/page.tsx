import type { ModuleItem } from "@/design-system/patterns/ModuleGrid";
import { ModuleGrid } from "@/design-system/patterns/ModuleGrid";
import { MODULE_NAV } from "@/shared/navigation/registry";

/**
 * Neutral module hub (change: app-module-hub, spec `module-hub`: Neutral Hub
 * Rendering at `/`, Static Module Cards, Hardcoded Module Discovery).
 * Renders only a fixed grid of module launcher cards — no per-module data,
 * no auto-redirect, no "last visited module" memory, no nav/FAB (those are
 * module-owned, e.g. Finance's `(finance)/layout.tsx`). `MODULES` now
 * derives from the shared registry (change: tablet-web-sidebar-layout,
 * tasks.md 2.7) instead of a separately hardcoded array — adding a module is
 * still one new `MODULE_NAV` entry, never a dynamic registry.
 */
const MODULES: ModuleItem[] = MODULE_NAV.map(({ label, icon, href }) => ({
  label,
  icon,
  href,
}));

export default function HubPage() {
  return (
    <main className="flex flex-col gap-6">
      <ModuleGrid items={MODULES} />
    </main>
  );
}
