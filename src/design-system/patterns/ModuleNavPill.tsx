import Link from "next/link";
import * as React from "react";
import type { ModuleNav } from "@/shared/navigation/registry";
import { NavPill } from "../ui/nav-pill";
import { FabMenu } from "./FabMenu";
import { OverflowMenu } from "./OverflowMenu";

export interface ModuleNavPillProps {
  module: ModuleNav;
}

const NAV_LINK_CLASS_NAME =
  "flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-200 ease-out hover:bg-nav-pill-foreground/10";

/**
 * Mobile bottom nav for a module, driven entirely by its `ModuleNav` entry
 * (change: tablet-web-sidebar-layout, design.md decision 7). Ports today's
 * hand-written pill markup from `(finance|health|recipes)/layout.tsx`
 * unchanged: first primary destination, then the central FAB, then any
 * remaining primary destinations, then the "Más" `OverflowMenu` trigger —
 * omitted entirely when the module has no overflow destinations (Recipes).
 */
export function ModuleNavPill({ module }: ModuleNavPillProps) {
  const primary = module.destinations.filter((d) => d.placement === "primary");
  const overflow = module.destinations.filter((d) => d.placement === "overflow");
  const [firstPrimary, ...restPrimary] = primary;

  return (
    <NavPill>
      {firstPrimary && (
        <Link
          href={firstPrimary.href}
          aria-label={firstPrimary.label}
          className={NAV_LINK_CLASS_NAME}
        >
          <firstPrimary.icon className="h-5 w-5" aria-hidden />
        </Link>
      )}
      <Link href={module.fab.href} aria-label={module.fab.label}>
        <FabMenu label={module.fab.buttonLabel} />
      </Link>
      {restPrimary.map((destination) => (
        <Link
          key={destination.href}
          href={destination.href}
          aria-label={destination.label}
          className={NAV_LINK_CLASS_NAME}
        >
          <destination.icon className="h-5 w-5" aria-hidden />
        </Link>
      ))}
      {overflow.length > 0 && (
        <OverflowMenu
          items={overflow.map((destination) => ({
            href: destination.href,
            label: destination.label,
            icon: <destination.icon className="h-5 w-5" aria-hidden />,
          }))}
        />
      )}
    </NavPill>
  );
}
