"use client";

import { usePathname } from "next/navigation";
import * as React from "react";
import { resolveActiveHref } from "@/shared/navigation/active-route";
import type { ModuleNav } from "@/shared/navigation/registry";
import { Sidebar, SidebarNavItem } from "../ui/sidebar";

export type SidebarNavDestination = {
  href: string;
  label: string;
  /** A rendered icon element, NOT a component reference (design.md decision 5) — the caller
   * (a Server Component) must map `LucideIcon` refs to elements before this prop crosses the
   * Server→Client boundary; see `OverflowMenu.tsx` for the documented RSC failure this avoids. */
  icon: React.ReactNode;
};

export type SidebarModuleNav = {
  id: ModuleNav["id"];
  href: string;
  label: string;
  destinations: readonly SidebarNavDestination[];
};

export interface SidebarNavProps {
  modules: readonly SidebarModuleNav[];
}

/**
 * Tablet/desktop sidebar (change: tablet-web-sidebar-layout, design.md decisions 2-4). Client
 * component — owns `usePathname` and the active-module selection so it never needs a server
 * pathname (App Router server layouts get none). Picks the active module via longest-prefix
 * match over every module's own href plus its destinations' hrefs, then renders only that
 * module's destinations plus a hub link. Renders `null` when no module matches (e.g. `/`) —
 * this falls out of the match returning nothing, no special-case hub check (decision 4).
 */
export function SidebarNav({ modules }: SidebarNavProps) {
  const pathname = usePathname();

  const allHrefs = React.useMemo(
    () =>
      modules.flatMap((module) => [
        module.href,
        ...module.destinations.map((destination) => destination.href),
      ]),
    [modules],
  );

  const activeHref = resolveActiveHref(pathname, allHrefs);

  const activeModule = React.useMemo(
    () =>
      modules.find(
        (module) =>
          module.href === activeHref ||
          module.destinations.some((destination) => destination.href === activeHref),
      ) ?? null,
    [modules, activeHref],
  );

  if (!activeModule) {
    return null;
  }

  const activeDestinationHref = resolveActiveHref(
    pathname,
    activeModule.destinations.map((destination) => destination.href),
  );

  return (
    <Sidebar>
      <SidebarNavItem href="/" label="Inicio del hub">
        LifeOS
      </SidebarNavItem>
      {activeModule.destinations.map((destination) => (
        <SidebarNavItem
          key={destination.href}
          href={destination.href}
          label={destination.label}
          active={destination.href === activeDestinationHref}
          icon={destination.icon}
        >
          {destination.label}
        </SidebarNavItem>
      ))}
    </Sidebar>
  );
}
