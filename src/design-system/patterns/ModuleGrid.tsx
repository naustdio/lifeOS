import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Card, CardContent } from "../ui/card";
import { cn } from "../ui/utils";

export interface ModuleItem {
  label: string;
  icon: LucideIcon;
  href: string;
}

export interface ModuleCardProps
  extends React.HTMLAttributes<HTMLAnchorElement>,
    ModuleItem {}

export interface ModuleGridProps extends React.HTMLAttributes<HTMLDivElement> {
  items: ModuleItem[];
}

/**
 * Pure launcher card for the neutral module hub at `/` (change: app-module-hub,
 * spec `module-hub`: Static Module Cards, Hardcoded Module Discovery). Renders
 * only `label`/`icon`/`href` — deliberately no data/badge/count slot, so a
 * module card can never fetch or display per-module data.
 */
export const ModuleCard = React.forwardRef<HTMLAnchorElement, ModuleCardProps>(
  ({ label, icon: Icon, href, className, ...props }, ref) => (
    <Link ref={ref} href={href} className={cn("block", className)} {...props}>
      <Card className="transition-colors duration-200 ease-out hover:bg-accent/60">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-secondary text-secondary-foreground">
            <Icon className="h-6 w-6" aria-hidden />
          </span>
          <span className="text-sm font-medium">{label}</span>
        </CardContent>
      </Card>
    </Link>
  ),
);
ModuleCard.displayName = "ModuleCard";

/**
 * Grid of `ModuleCard`s — the entire content of the neutral hub at `/`
 * (spec `module-hub`: Neutral Hub Rendering at `/`). No data/count props on
 * either component, enforcing the "pure launcher" product decision.
 */
export const ModuleGrid = React.forwardRef<HTMLDivElement, ModuleGridProps>(
  ({ items, className, ...props }, ref) => (
    <div ref={ref} className={cn("grid grid-cols-2 gap-4", className)} {...props}>
      {items.map((item) => (
        <ModuleCard key={item.href} {...item} />
      ))}
    </div>
  ),
);
ModuleGrid.displayName = "ModuleGrid";
