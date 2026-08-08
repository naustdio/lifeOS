import { Repeat } from "lucide-react";
import * as React from "react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Mensual",
  weekly: "Semanal",
  biweekly: "Quincenal",
  yearly: "Anual",
};

export interface RecurringRowProps extends React.HTMLAttributes<HTMLDivElement> {
  description: string;
  formattedAmount: string;
  frequency: "monthly" | "weekly" | "biweekly" | "yearly";
  /** Whole days overdue. 0 = due today. Ignored when `paused`. */
  daysOverdue: number;
  paused?: boolean;
  onConfirm?: () => void;
  onDiscard?: () => void;
  confirmPending?: boolean;
  discardPending?: boolean;
  /** Set only for a bounded installment-purchase definition (finance-installment-recurring):
   *  occurrences left to post / the fixed total. Hides "Omitir" — skipping a scheduled debt
   *  installment isn't a real option the way skipping a discretionary expense is. */
  installmentsRemaining?: number | null;
  installmentTotal?: number | null;
}

function dueLabel(daysOverdue: number): string {
  if (daysOverdue === 0) return "Vence hoy";
  if (daysOverdue < 0) {
    const inDays = Math.abs(daysOverdue);
    return inDays === 1 ? "Vence en 1 día" : `Vence en ${inDays} días`;
  }
  return daysOverdue === 1 ? "Vencida hace 1 día" : `Vencida hace ${daysOverdue} días`;
}

/**
 * Row for a recurring expense definition (design.md §9, change: finance-recurring R-012). Not
 * `TransactionRow`: it renders a due/overdue state, a paused state, a frequency label, and two
 * inline actions (`Confirmar`/`Omitir`) — a shape `TransactionRow` (used by Home and
 * Movimientos) does not have.
 */
export const RecurringRow = React.forwardRef<HTMLDivElement, RecurringRowProps>(
  (
    {
      description,
      formattedAmount,
      frequency,
      daysOverdue,
      paused,
      onConfirm,
      onDiscard,
      confirmPending,
      discardPending,
      installmentsRemaining,
      installmentTotal,
      className,
      ...props
    },
    ref,
  ) => {
    const isInstallment = installmentsRemaining != null && installmentTotal != null;

    return (
      <div
        ref={ref}
        className={cn("flex items-center gap-3 py-3", paused && "opacity-50", className)}
        {...props}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-secondary text-secondary-foreground">
          <Repeat className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 flex flex-col">
          <span className="truncate text-sm font-medium">{description}</span>
          <span className={cn("truncate text-xs", !paused && daysOverdue > 0 ? "text-expense" : "text-muted-foreground")}>
            {paused ? "En pausa" : dueLabel(daysOverdue)} · {FREQUENCY_LABELS[frequency] ?? frequency}
            {isInstallment && ` · Quedan ${installmentsRemaining} de ${installmentTotal} pagos`}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-medium">{formattedAmount}</span>
          {!paused && (
            <div className="flex gap-1">
              {!isInstallment && (
                <Button type="button" size="sm" variant="ghost" onClick={onDiscard} disabled={discardPending}>
                  Omitir
                </Button>
              )}
              <Button type="button" size="sm" onClick={onConfirm} disabled={confirmPending}>
                Confirmar
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  },
);
RecurringRow.displayName = "RecurringRow";
