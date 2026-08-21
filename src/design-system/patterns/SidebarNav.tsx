"use client";

import { LayoutGrid, PanelLeft, PanelLeftClose } from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";
import { resolveActiveHref } from "@/shared/navigation/active-route";
import type { ModuleNav } from "@/shared/navigation/registry";
import { Sidebar, SidebarNavItem } from "../ui/sidebar";

const COLLAPSED_STORAGE_KEY = "lifeos:sidebar-collapsed";

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
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true");
  }, []);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

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

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label="Mostrar navegación"
        className="fixed left-4 top-4 z-40 hidden h-9 w-9 items-center justify-center rounded-card border border-border bg-card text-muted-foreground shadow-soft transition-colors duration-200 ease-out hover:text-foreground md:flex"
      >
        <PanelLeft className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  return (
    <Sidebar>
      <div className="flex items-center gap-1 pr-1">
        <div className="min-w-0 flex-1">
          <SidebarNavItem
            href="/"
            label="Todos los módulos"
            icon={<LayoutGrid className="h-5 w-5" aria-hidden />}
          >
            Todos los módulos
          </SidebarNavItem>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Contraer navegación"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
        >
          <PanelLeftClose className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mb-1 border-t border-border" role="separator" />
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
