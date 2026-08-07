"use client";

import { MoneyAmount } from "@/design-system/patterns/MoneyAmount";
import { Card, CardContent } from "@/design-system/ui/card";
import { formatCentsAsMXN } from "@/shared/money";

export type ProjectionOccurrence = {
  definitionId: string;
  description: string;
  /** POSITIVE magnitude (design.md §2 Decision 9). */
  amountCents: number;
  kind: "outflow" | "inflow";
  overdue: boolean;
};

export type ProjectionDay = {
  date: string;
  closingBalanceCents: number;
  isNegative: boolean;
  occurrences: ProjectionOccurrence[];
};

export interface ProjectionDayPanelProps {
  day: ProjectionDay | null;
}

/**
 * Selected-day detail (design.md §4, change: finance-calendar-projection K-012). Client,
 * presentational — receives an already-computed `ProjectionDay`, computes nothing. Each
 * occurrence renders as an inflow or outflow per `kind`, with an explicit overdue marker for
 * folded rows (design.md §6 Decision 3).
 */
export function ProjectionDayPanel({ day }: ProjectionDayPanelProps) {
  if (!day) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Selecciona un día para ver el detalle.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">{day.date}</span>
          <span className={day.isNegative ? "text-sm font-semibold tabular-nums text-expense" : "text-sm font-semibold tabular-nums"}>
            {formatCentsAsMXN(day.closingBalanceCents)}
          </span>
        </div>

        {day.occurrences.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin cargos programados este día.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {day.occurrences.map((occurrence) => (
              <li key={occurrence.definitionId} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{occurrence.description}</span>
                  {occurrence.overdue && (
                    <span className="shrink-0 rounded-pill bg-expense/10 px-2 py-0.5 text-xs font-medium text-expense">
                      Vencida
                    </span>
                  )}
                </span>
                <MoneyAmount
                  className="shrink-0"
                  kind={occurrence.kind === "inflow" ? "income" : "expense"}
                  formatted={formatCentsAsMXN(
                    occurrence.kind === "inflow" ? occurrence.amountCents : -occurrence.amountCents,
                  )}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
