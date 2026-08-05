import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { MoneyAmount } from "./MoneyAmount";
import { cn } from "../ui/utils";

export interface TransactionRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Leading circle glyph; falls back to the first letter of `title` when omitted. */
  icon?: LucideIcon;
  /** Account or merchant name. */
  title: string;
  /** e.g. "Gasto · 2026-08-05" or an account type label. */
  subtitle?: string;
  /** Pre-formatted es-MX MXN string. */
  formattedAmount: string;
  kind: "income" | "expense";
  /** Voided rows render at reduced opacity. */
  muted?: boolean;
  /** e.g. the "Editar" link. */
  trailing?: React.ReactNode;
}

/**
 * Shared, borderless transaction/account row (design.md Decision 1/2).
 * Replaces the ad hoc rows previously duplicated on Home, Cuentas, and
 * Movimientos.
 */
export const TransactionRow = React.forwardRef<HTMLDivElement, TransactionRowProps>(
  ({ icon: Icon, title, subtitle, formattedAmount, kind, muted, trailing, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "group flex items-center gap-3 py-3 transition-colors duration-200 ease-out hover:bg-accent/60 -mx-2 px-2 rounded-card",
        muted && "opacity-50",
        className,
      )}
      {...props}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-secondary text-secondary-foreground">
        {Icon ? (
          <Icon className="h-4 w-4" aria-hidden />
        ) : (
          <span className="text-sm font-medium" aria-hidden>
            {title.charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1 flex flex-col">
        <span className="truncate text-sm font-medium">{title}</span>
        {subtitle ? <span className="truncate text-xs text-muted-foreground">{subtitle}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <MoneyAmount formatted={formattedAmount} kind={kind} />
        {trailing}
      </div>
    </div>
  ),
);
TransactionRow.displayName = "TransactionRow";
