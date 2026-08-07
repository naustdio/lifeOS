"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { CalendarGrid, type CalendarCell } from "@/design-system/patterns/CalendarGrid";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { ProjectionDayPanel, type ProjectionDay } from "./ProjectionDayPanel";

export interface CalendarScreenProps {
  /** "YYYY-MM" — the month containing `fromDate`. */
  initialMonth: string;
  /** Every month touched by the 90-day horizon, ascending — bounds month navigation
   *  (design.md §3/§4). */
  selectableMonths: string[];
  monthsCells: Record<string, CalendarCell[]>;
  daysByDate: Record<string, ProjectionDay>;
  fromDate: string;
  /** Pre-formatted es-MX MXN for `availableCents` — the day-0 anchor. */
  formattedAnchor: string;
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

function monthLabel(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const name = MONTH_NAMES[monthNum - 1] ?? month;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

/**
 * Client screen for `/calendario` (design.md §3/§4, change: finance-calendar-projection K-013).
 * Owns ONLY visible-month + selected-day state — every cell, every balance, and the set of
 * navigable months is precomputed server-side in `page.tsx` (design.md §6 Decision 6/8). Month
 * navigation is bounded to `selectableMonths`, never a generic calendar's infinite prev/next.
 */
export function CalendarScreen({
  initialMonth,
  selectableMonths,
  monthsCells,
  daysByDate,
  fromDate,
  formattedAnchor,
}: CalendarScreenProps) {
  const [visibleMonth, setVisibleMonth] = React.useState(initialMonth);
  const [selectedDate, setSelectedDate] = React.useState<string>(fromDate);

  const monthIndex = selectableMonths.indexOf(visibleMonth);
  const canGoPrev = monthIndex > 0;
  const canGoNext = monthIndex >= 0 && monthIndex < selectableMonths.length - 1;

  const cells = monthsCells[visibleMonth] ?? [];
  const selectedDay = daysByDate[selectedDate] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-1 pt-6">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Disponible hoy</span>
            <span className="text-lg font-semibold tabular-nums">{formattedAnchor}</span>
          </div>
          <span className="text-xs text-muted-foreground">Próximos 90 días</span>
          <p className="text-xs text-muted-foreground">
            Muestra únicamente salidas proyectadas de tus recurrentes activos — no incluye
            ingresos futuros ni es un pronóstico completo de saldo.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Mes anterior"
          disabled={!canGoPrev}
          onClick={() => canGoPrev && setVisibleMonth(selectableMonths[monthIndex - 1])}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </Button>
        <span className="text-sm font-medium">{monthLabel(visibleMonth)}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Mes siguiente"
          disabled={!canGoNext}
          onClick={() => canGoNext && setVisibleMonth(selectableMonths[monthIndex + 1])}
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </Button>
      </div>

      <CalendarGrid month={visibleMonth} cells={cells} selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      <ProjectionDayPanel day={selectedDay} />
    </div>
  );
}
