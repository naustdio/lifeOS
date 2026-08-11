import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { cn } from "../ui/utils";

export interface QuickAction {
  label: string;
  icon: LucideIcon;
  href: string;
}

export interface QuickActionRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 2-4 actions; every `href` must resolve to an already-working route. */
  actions: QuickAction[];
}

/**
 * Circular icon-button row below the balance hero (design.md Decision 4).
 * Every action links to a real, already-working destination — no disabled
 * or placeholder buttons (spec: "Quick Action Row Contains Only Real
 * Destinations").
 */
export const QuickActionRow = React.forwardRef<HTMLDivElement, QuickActionRowProps>(
  ({ actions, className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-start justify-around gap-2", className)} {...props}>
      {actions.map(({ label, icon: Icon, href }) => (
        <Link key={href + label} href={href} className="group flex w-16 flex-col items-center gap-2 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-pill border border-border bg-card text-card-foreground shadow-soft transition-all duration-300 group-hover:bg-foreground group-hover:text-background active:scale-95">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-xs text-muted-foreground transition-colors group-hover:text-foreground">
            {label}
          </span>
        </Link>
      ))}
    </div>
  ),
);
QuickActionRow.displayName = "QuickActionRow";
