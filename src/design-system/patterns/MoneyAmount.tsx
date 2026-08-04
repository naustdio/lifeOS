import * as React from "react";
import { cn } from "../ui/utils";

export interface MoneyAmountProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Pre-formatted display string (centavos -> es-MX string is `shared/money.ts`, sub-slice 2A). */
  formatted: string;
  kind: "income" | "expense";
}

/**
 * Renders income in the `--income` (green) token and expense in the
 * `--expense` (red) token — NEVER the brand accent (design-system spec:
 * "Dual Theme Support" scenario "Semantic amount colors remain consistent
 * across themes").
 */
export const MoneyAmount = React.forwardRef<HTMLSpanElement, MoneyAmountProps>(
  ({ formatted, kind, className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "font-semibold tabular-nums",
        kind === "income" ? "text-income" : "text-expense",
        className,
      )}
      {...props}
    >
      {formatted}
    </span>
  ),
);
MoneyAmount.displayName = "MoneyAmount";
