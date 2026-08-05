import * as React from "react";
import { centsToPesos } from "@/shared/money";
import { cn } from "../ui/utils";

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  valueCents: number;
  limitCents: number;
  /** Overrides the default "value / limit MXN" label. */
  label?: string;
  "aria-label"?: string;
}

/**
 * Shared pill progress bar (design.md Decision 3). Centralizes the
 * `Math.min(100, Math.round(value / limit * 100))` clamp and the
 * `limitCents === 0` divide-by-zero guard that were previously duplicated
 * in `BudgetForm` and the savings-goal cards on Home/Cuentas.
 */
export const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ valueCents, limitCents, label, className, ...props }, ref) => {
    const pct = limitCents > 0 ? Math.min(100, Math.round((valueCents / limitCents) * 100)) : 0;
    const atOrOver = limitCents > 0 && valueCents >= limitCents;
    const displayLabel =
      label ?? `${centsToPesos(valueCents).toFixed(2)} / ${centsToPesos(limitCents).toFixed(2)} MXN`;

    return (
      <div ref={ref} className={cn("flex flex-col gap-1", className)} {...props}>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-pill bg-secondary"
        >
          <div
            className={cn(
              "h-full rounded-pill transition-[width] duration-200 ease-out",
              atOrOver ? "bg-expense" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={cn("text-xs", atOrOver ? "text-expense" : "text-muted-foreground")}>{displayLabel}</span>
      </div>
    );
  },
);
ProgressBar.displayName = "ProgressBar";
