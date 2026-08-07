import * as React from "react";
import { cn } from "../ui/utils";

/**
 * Primitive cell shape the grid renders (design.md §4). Deliberately structurally identical to,
 * but INDEPENDENT of, `modules/finance/domain/calendar.ts`'s own `CalendarCell` export — no
 * finance type crosses into `design-system/`, so this pattern stays domain-free and
 * `check-tokens.mjs`/the ESLint boundary lint have nothing to flag.
 */
export type CalendarCell = {
  date: string;
  day: number;
  inHorizon: boolean;
  hasCharges: boolean;
  isNegative: boolean;
  isToday: boolean;
  /** Pre-formatted, currency-symbol-free number to render under the day — meaning depends on
   *  `mode` (cumulative running balance, or that day's own net movement). Empty string when out
   *  of horizon. */
  balanceLabel: string;
};

export interface CalendarGridProps {
  /** "YYYY-MM" — used only to compute the leading offset of `cells[0]`. */
  month: string;
  /** Exactly the days of `month`, ascending (design.md §4). */
  cells: CalendarCell[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

// Sunday-first, matching the es-MX locale's own `firstDay` and Mexican printed calendars
// (design.md §4) — a named constant, not an inline assumption.
const WEEKDAY_HEADERS = ["D", "L", "M", "M", "J", "V", "S"] as const;

function leadingOffset(month: string): number {
  const [yearStr, monthStr] = month.split("-");
  return new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, 1)).getUTCDay();
}

function cellAriaLabel(cell: CalendarCell): string {
  const parts = [cell.date];
  if (cell.isToday) parts.push("hoy");
  if (cell.hasCharges) parts.push("con cargos");
  if (cell.isNegative) parts.push("saldo negativo");
  return parts.join(", ");
}

function CalendarDayCell({
  cell,
  selected,
  onSelectDate,
}: {
  cell: CalendarCell;
  selected: boolean;
  onSelectDate: (date: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={!cell.inHorizon}
      aria-pressed={selected}
      aria-label={cellAriaLabel(cell)}
      onClick={() => onSelectDate(cell.date)}
      className={cn(
        "flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-card text-xs transition-colors duration-200 ease-out",
        cell.inHorizon ? "hover:bg-accent" : "cursor-not-allowed text-muted-foreground/40",
        selected && "bg-secondary text-secondary-foreground",
        cell.isToday && "font-semibold",
      )}
    >
      <span>{cell.day}</span>
      {cell.inHorizon && (
        <span
          className={cn(
            "tabular-nums",
            cell.isNegative ? "text-expense" : "text-muted-foreground",
            selected && "text-secondary-foreground",
          )}
        >
          {cell.balanceLabel}
        </span>
      )}
    </button>
  );
}

/**
 * Hand-built CSS-grid calendar (design.md §4, Decision 7 — no date library, no new dependency).
 * Primitive props only: no finance types, no cents. Cells are `button`s with `aria-pressed`/
 * `aria-label` so the grid is keyboard-operable without a roving-tabindex implementation.
 * Out-of-horizon cells render muted and `disabled`.
 */
export function CalendarGrid({ month, cells, selectedDate, onSelectDate }: CalendarGridProps) {
  const offset = leadingOffset(month);

  return (
    <div role="grid" aria-label="Calendario de proyección" className="grid grid-cols-7 gap-1">
      {WEEKDAY_HEADERS.map((label, index) => (
        <div key={`header-${index}`} className="text-center text-xs font-medium text-muted-foreground">
          {label}
        </div>
      ))}

      {Array.from({ length: offset }, (_, index) => (
        <div key={`offset-${index}`} aria-hidden />
      ))}

      {cells.map((cell) => (
        <CalendarDayCell
          key={cell.date}
          cell={cell}
          selected={cell.date === selectedDate}
          onSelectDate={onSelectDate}
        />
      ))}
    </div>
  );
}
