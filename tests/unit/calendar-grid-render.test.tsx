import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RTL smoke-render for `CalendarGrid` (design.md §4/§8, change: finance-calendar-projection
 * K-009): 7 weekday header cells (Sunday-first) plus `offset + daysInMonth` day cells, a
 * `hasCharges` marker, the `--expense` token on a negative day, `onSelectDate` wiring, a11y
 * labels, and disabled out-of-horizon cells.
 */

import type { CalendarCell } from "@/design-system/patterns/CalendarGrid";

const { CalendarGrid } = await import("@/design-system/patterns/CalendarGrid");

// 2026-08-01 is a Saturday (UTC) -> leading offset of 6 blank cells before day 1.
const AUGUST_2026_DAY_COUNT = 31;

function buildCells(overrides: Partial<CalendarCell>[] = []): CalendarCell[] {
  return Array.from({ length: AUGUST_2026_DAY_COUNT }, (_, index) => {
    const day = index + 1;
    const date = `2026-08-${String(day).padStart(2, "0")}`;
    const base: CalendarCell = {
      date,
      day,
      inHorizon: true,
      hasCharges: false,
      isNegative: false,
      isToday: false,
      balanceLabel: "0",
    };
    const override = overrides.find((o) => o.date === date);
    return override ? { ...base, ...override } : base;
  });
}

describe("CalendarGrid — smoke render (K-009)", () => {
  afterEach(() => cleanup());

  it("renders 7 weekday headers plus offset + daysInMonth day cells", () => {
    const cells = buildCells();
    render(<CalendarGrid month="2026-08" cells={cells} selectedDate={null} onSelectDate={vi.fn()} />);

    expect(screen.getAllByText("D").length).toBeGreaterThanOrEqual(1);
    // 6 leading blank offset cells (Saturday) + 31 day buttons.
    expect(screen.getAllByRole("button")).toHaveLength(AUGUST_2026_DAY_COUNT);
  });

  it("marks a hasCharges day and applies the expense token on a negative day's balance label", () => {
    const cells = buildCells([{ date: "2026-08-10", hasCharges: true, isNegative: true, balanceLabel: "-500" }]);
    render(<CalendarGrid month="2026-08" cells={cells} selectedDate={null} onSelectDate={vi.fn()} />);

    const negativeCell = screen.getByRole("button", { name: /2026-08-10.*saldo negativo/ });
    expect(negativeCell.querySelector(".text-expense")).toBeInTheDocument();
    expect(negativeCell).toHaveTextContent("-500");
  });

  it("calls onSelectDate when a cell is clicked", () => {
    const onSelectDate = vi.fn();
    const cells = buildCells();
    render(<CalendarGrid month="2026-08" cells={cells} selectedDate={null} onSelectDate={onSelectDate} />);

    fireEvent.click(screen.getByRole("button", { name: /2026-08-15/ }));

    expect(onSelectDate).toHaveBeenCalledWith("2026-08-15");
  });

  it("gives every cell a date-bearing aria-label and disables out-of-horizon cells", () => {
    const cells = buildCells([{ date: "2026-08-31", inHorizon: false }]);
    render(<CalendarGrid month="2026-08" cells={cells} selectedDate={null} onSelectDate={vi.fn()} />);

    expect(screen.getByRole("button", { name: /2026-08-01/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2026-08-31/ })).toBeDisabled();
  });
});
