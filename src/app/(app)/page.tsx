import { HeartPulse, Wallet } from "lucide-react";
import type { ModuleItem } from "@/design-system/patterns/ModuleGrid";
import { ModuleGrid } from "@/design-system/patterns/ModuleGrid";

/**
 * Neutral module hub (change: app-module-hub, spec `module-hub`: Neutral Hub
 * Rendering at `/`, Static Module Cards, Hardcoded Module Discovery).
 * Renders only a fixed grid of module launcher cards — no per-module data,
 * no auto-redirect, no "last visited module" memory, no nav/FAB (those are
 * module-owned, e.g. Finance's `(finance)/layout.tsx`). Adding a module is
 * one new `MODULES` entry, never a dynamic registry.
 */
const MODULES: ModuleItem[] = [
  { label: "Finanzas", icon: Wallet, href: "/finance" },
  { label: "Salud", icon: HeartPulse, href: "/salud" },
];

export default function HubPage() {
  return (
    <main className="flex flex-col gap-6">
      <ModuleGrid items={MODULES} />
    </main>
  );
}
