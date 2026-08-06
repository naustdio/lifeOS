import { CalendarRange } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { EmptyState } from "./EmptyState";
import { MoneyAmount } from "./MoneyAmount";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../ui/utils";

export interface MonthSummaryCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** e.g. "Agosto 2026" — formatted by the caller, never a Date across the boundary. */
  monthLabel: string;
  incomeCents: number;
  expenseCents: number;
  /** Pre-formatted es-MX MXN strings, same contract as TransactionRow.formattedAmount. */
  formattedIncome: string;
  formattedExpense: string;
}

/**
 * Home's "este mes" card (design.md §4.1, change: finance-dashboard-feed F-007). Renders
 * income/expense totals for the current calendar month; renders the shipped `EmptyState`
 * when the month has zero qualifying transactions, per design.md §7 — never a bare 0/NaN
 * layout.
 */
export const MonthSummaryCard = React.forwardRef<HTMLDivElement, MonthSummaryCardProps>(
  (
    { monthLabel, incomeCents, expenseCents, formattedIncome, formattedExpense, className, ...props },
    ref,
  ) => {
    if (incomeCents === 0 && expenseCents === 0) {
      return (
        <EmptyState
          ref={ref}
          className={className}
          icon={CalendarRange}
          heading="Aún no hay movimientos este mes"
          description="Registra un gasto o un ingreso para ver tu resumen."
          action={
            <Button asChild size="sm">
              <Link href="/movimientos">Nueva transacción</Link>
            </Button>
          }
          {...props}
        />
      );
    }

    return (
      <Card ref={ref} className={cn(className)} {...props}>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">{monthLabel}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Ingresos</span>
            <MoneyAmount formatted={formattedIncome} kind="income" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Gastos</span>
            <MoneyAmount formatted={formattedExpense} kind="expense" />
          </div>
        </CardContent>
      </Card>
    );
  },
);
MonthSummaryCard.displayName = "MonthSummaryCard";
