import * as React from "react";
import { cn } from "../ui/utils";

export interface BalanceHeroProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Pre-formatted `available_cents` display string — the hero number. */
  formatted: string;
  label?: string;
  /** Optional slot rendered below the number, e.g. a `QuickActionRow`. */
  footer?: React.ReactNode;
}

/**
 * "The big number rules the screen" (proposal design-direction table). Sub-
 * slice 1A ships the shell only; real `available_cents` data wiring lands
 * in sub-slice 2C (T-039). `footer` slot (finance-ui-polish) lets the caller
 * place `QuickActionRow` directly adjacent to the hero without the hero
 * knowing about it.
 */
export const BalanceHero = React.forwardRef<HTMLDivElement, BalanceHeroProps>(
  ({ formatted, label = "Disponible", footer, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col items-center gap-2 rounded-card bg-nav-pill px-8 py-10 text-center text-nav-pill-foreground shadow-soft-lg",
        className,
      )}
      {...props}
    >
      <span className="text-sm font-medium tracking-tight text-nav-pill-foreground/70">{label}</span>
      <span className="text-hero font-bold tabular-nums">{formatted}</span>
      {footer ? <div className="mt-4 w-full">{footer}</div> : null}
    </div>
  ),
);
BalanceHero.displayName = "BalanceHero";
