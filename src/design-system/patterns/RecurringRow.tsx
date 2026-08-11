import { Repeat } from "lucide-react";
import * as React from "react";
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
  /** Set only for a bounded installment-purchase definition (finance-installment-recurring):
   *  occurrences left to post / the fixed total. Drives the meta-line "· Quedan X de Y pagos"
   *  suffix and the caller's own action-menu wording (this component renders no buttons itself). */
  installmentsRemaining?: number | null;
  installmentTotal?: number | null;
  /** Plain boolean marker, no provider/logo/catalog (change: finance-subscriptions). Renders as
   *  its own non-truncating chip under the amount — the meta line already truncates on long
   *  descriptions, so appending it there risked hiding the one thing this flag exists to show. */
  isSubscription?: boolean;
  /** Every row action (Confirmar/Omitir/Pausar/Eliminar) collapsed behind a single `RowActionMenu`
   *  slot — the description/meta text needs the width, so this row renders no inline buttons of
   *  its own; the caller owns the full action set. */
  rowActions?: React.ReactNode;
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
 * `TransactionRow`: it renders a due/overdue state, a paused state, and a frequency label — a
 * shape `TransactionRow` (used by Home and Movimientos) does not have. All actions live behind
 * the caller-supplied `rowActions` menu (change: finance-recurring-row-actions) so the
 * description/meta text column keeps its width instead of competing with inline buttons.
 */
export const RecurringRow = React.forwardRef<HTMLDivElement, RecurringRowProps>(
  (
    {
      description,
      formattedAmount,
      frequency,
      daysOverdue,
      paused,
      installmentsRemaining,
      installmentTotal,
      isSubscription,
      rowActions,
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
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{formattedAmount}</span>
            {rowActions}
          </div>
          {isSubscription && (
            <span className="rounded-pill bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
              Suscripción
            </span>
          )}
        </div>
      </div>
    );
  },
);
RecurringRow.displayName = "RecurringRow";
