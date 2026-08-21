import Link from "next/link";
import { redirect } from "next/navigation";
import type * as React from "react";
import { SidebarNav } from "@/design-system/patterns/SidebarNav";
import { ThemeToggle } from "@/design-system/ui/theme-toggle";
import { MODULE_NAV } from "@/shared/navigation/registry";
import { createClient } from "@/shared/supabase/server";

/**
 * Minimal authenticated shell (spec `identity/Household Terminology Hidden
 * From UI`, T-017; change app-module-hub, spec `module-hub`: Neutral Outer
 * Shell). Provides only the auth guard, the `max-w-md` container, and the
 * header — no module-specific nav lives here below `md` (768px). Each module
 * owns its own mobile nav inside its nested route-group layout (e.g.
 * Finance's `(finance)/layout.tsx`). The header title links back to `/`, the
 * neutral module hub (spec: Title Links Back to the Hub) — the only "back to
 * hub" affordance below `md`.
 *
 * At `md` and above, this shell also mounts the shared `SidebarNav` (change:
 * tablet-web-sidebar-layout) — the one cross-module surface `module-hub`'s
 * "Neutral Outer Shell" requirement allows here. Icon refs are mapped to
 * rendered elements here, in the Server Component, before crossing into the
 * `"use client"` `SidebarNav` (design.md decision 5) — a bare `LucideIcon`
 * component reference fails RSC serialization (see `OverflowMenu.tsx`).
 *
 * `src/middleware.ts` already redirects unauthenticated requests to
 * `/entrar` before they reach this layout; the check here is defense in
 * depth, not the primary guard.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/entrar");
  }

  const sidebarModules = MODULE_NAV.map((module) => ({
    id: module.id,
    href: module.href,
    label: module.label,
    destinations: module.destinations.map((destination) => ({
      href: destination.href,
      label: destination.label,
      icon: <destination.icon className="h-5 w-5" aria-hidden />,
    })),
  }));

  return (
    <div className="md:flex md:justify-center md:gap-8">
      <SidebarNav modules={sidebarModules} />
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 pb-28 pt-8 md:pb-8">
        <div className="flex items-center justify-between">
          <Link href="/">
            <h1 className="text-xl font-semibold">LifeOS</h1>
          </Link>
          <ThemeToggle />
        </div>
        {children}
      </div>
    </div>
  );
}
