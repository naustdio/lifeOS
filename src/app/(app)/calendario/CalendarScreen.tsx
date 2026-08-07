"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { CalendarGrid, type CalendarCell } from "@/design-system/patterns/CalendarGrid";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { cn } from "@/design-system/ui/utils";
import { formatCentsAsMXN, formatCentsCompact } from "@/shared/money";
import { ProjectionDayPanel, type ProjectionDay } from "./ProjectionDayPanel";

/** Structural subset of the domain `CalendarCell` (design.md §4) — deliberately local, not
 *  imported from `@/modules/finance/api`, matching this project's established convention that
 *  client components define their own structural prop types rather than importing types from
 *  the server-only-guarded finance barrel. */
type ProjectionCell = {
  date: string;
  day: number;
  inHorizon: boolean;
  hasCharges: boolean;
  isNegative: boolean;
  isToday: boolean;
  closingBalanceCents: number;
  netCents: number;
};

export interface CalendarScreenProps {
  /** "YYYY-MM" — the month containing `fromDate`. */
  initialMonth: string;
  /** Every month touched by the 90-day horizon, ascending — bounds month navigation
   *  (design.md §3/§4). */
  selectableMonths: string[];
  monthsCells: Record<string, ProjectionCell[]>;
  daysByDate: Record<string, ProjectionDay>;
  fromDate: string;
  /** Pre-formatted es-MX MXN for `availableCents` — the day-0 anchor. */
  formattedAnchor: string;
  /** Pre-formatted es-MX MXN for the household's current total credit-card debt (static
   *  snapshot — cards are not part of this projection's scope). */
  formattedCardsOwed: string;
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

function lastDayLabel(month: string): string {
  const [yearStr, monthStr] = month.split("-");
  const lastDay = new Date(Date.UTC(Number(yearStr), Number(monthStr), 0)).getUTCDate();
  const name = MONTH_NAMES[Number(monthStr) - 1] ?? monthStr;
  return `${lastDay} ${name.slice(0, 3)}`;
}

type Mode = "balance" | "flujo";

/**
 * Client screen for `/calendario` (design.md §3/§4, change: finance-calendar-projection K-013,
 * Phase 2 balance-density pass). Owns visible-month, selected-day, AND display-mode state — every
 * cell's underlying cents figures are precomputed server-side in `page.tsx`; only the
 * cents->compact-label formatting per the active mode happens here, client-side, since the mode
 * toggle is local UI state with no server round trip.
 */
export function CalendarScreen({
  initialMonth,
  selectableMonths,
  monthsCells,
  daysByDate,
  fromDate,
  formattedAnchor,
  formattedCardsOwed,
}: CalendarScreenProps) {
  const [visibleMonth, setVisibleMonth] = React.useState(initialMonth);
  const [selectedDate, setSelectedDate] = React.useState<string>(fromDate);
  const [mode, setMode] = React.useState<Mode>("balance");

  const monthIndex = selectableMonths.indexOf(visibleMonth);
  const canGoPrev = monthIndex > 0;
  const canGoNext = monthIndex >= 0 && monthIndex < selectableMonths.length - 1;

  const rawCells = React.useMemo(() => monthsCells[visibleMonth] ?? [], [monthsCells, visibleMonth]);
  const cells: CalendarCell[] = React.useMemo(
    () =>
      rawCells.map((c) => ({
        date: c.date,
        day: c.day,
        inHorizon: c.inHorizon,
        hasCharges: c.hasCharges,
        isNegative: c.isNegative,
        isToday: c.isToday,
        balanceLabel: c.inHorizon
          ? formatCentsCompact(mode === "balance" ? c.closingBalanceCents : c.netCents)
          : "",
      })),
    [rawCells, mode],
  );

  const selectedDay = daysByDate[selectedDate] ?? null;
  const lastVisibleCell = [...rawCells].reverse().find((c) => c.inHorizon);
  const formattedMonthEndBalance = lastVisibleCell
    ? formatCentsAsMXN(lastVisibleCell.closingBalanceCents)
    : formattedAnchor;

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
            Proyecta tu saldo día a día sumando ingresos y restando gastos recurrentes activos.
            No incluye pagos de tarjeta ni movimientos manuales aún.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
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
        <div role="group" aria-label="Modo de visualización" className="flex rounded-pill bg-secondary p-0.5">
          <button
            type="button"
            aria-pressed={mode === "balance"}
            onClick={() => setMode("balance")}
            className={cn(
              "rounded-pill px-3 py-1 text-xs font-medium transition-colors duration-200 ease-out",
              mode === "balance" ? "bg-primary text-primary-foreground" : "text-secondary-foreground",
            )}
          >
            Balance
          </button>
          <button
            type="button"
            aria-pressed={mode === "flujo"}
            onClick={() => setMode("flujo")}
            className={cn(
              "rounded-pill px-3 py-1 text-xs font-medium transition-colors duration-200 ease-out",
              mode === "flujo" ? "bg-primary text-primary-foreground" : "text-secondary-foreground",
            )}
          >
            Flujo
          </button>
        </div>
      </div>

      <CalendarGrid month={visibleMonth} cells={cells} selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      <Card>
        <CardContent className="flex items-center justify-between gap-4 pt-6 text-sm">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Balance al {lastDayLabel(visibleMonth)}</span>
            <span className="font-semibold tabular-nums">{formattedMonthEndBalance}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground">Tarjetas de crédito</span>
            <span className="font-semibold tabular-nums text-expense">{formattedCardsOwed}</span>
          </div>
        </CardContent>
      </Card>

      <ProjectionDayPanel day={selectedDay} />
    </div>
  );
}
