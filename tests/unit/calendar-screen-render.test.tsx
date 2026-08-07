import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";

/**
 * RTL smoke-render for `CalendarScreen` (design.md §4/§8, change: finance-calendar-projection
 * K-011): the outflows-only disclaimer is present (tested requirement per spec, not a nicety),
 * an all-zero projection renders a grid rather than an error/blank, selecting a day updates
 * `ProjectionDayPanel`, and a folded-overdue row is visibly marked as overdue.
 */

const { CalendarScreen } = await import("@/app/(app)/calendario/CalendarScreen");

function buildMonthCells(month: string, overrides: Record<string, Partial<{ hasCharges: boolean; isNegative: boolean }>> = {}) {
  const [year, monthNum] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const override = overrides[date] ?? {};
    return {
      date,
      day,
      inHorizon: true,
      hasCharges: override.hasCharges ?? false,
      isNegative: override.isNegative ?? false,
      isToday: date === `${month}-06`,
    };
  });
}

describe("CalendarScreen — smoke render (K-011)", () => {
  afterEach(() => cleanup());

  it("shows the outflows-only disclaimer", () => {
    render(
      <CalendarScreen
        initialMonth="2026-08"
        selectableMonths={["2026-08"]}
        monthsCells={{ "2026-08": buildMonthCells("2026-08") }}
        daysByDate={{}}
        fromDate="2026-08-06"
        formattedAnchor="$1,500.00"
      />,
    );

    expect(screen.getByText(/proyecta tu saldo/i)).toBeInTheDocument();
  });

  it("renders a grid, not an error, for an all-zero projection", () => {
    render(
      <CalendarScreen
        initialMonth="2026-08"
        selectableMonths={["2026-08"]}
        monthsCells={{ "2026-08": buildMonthCells("2026-08") }}
        daysByDate={{}}
        fromDate="2026-08-06"
        formattedAnchor="$1,500.00"
      />,
    );

    expect(screen.getByRole("grid", { name: "Calendario de proyección" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /2026-08/ }).length).toBeGreaterThan(0);
  });

  it("selecting a day updates the ProjectionDayPanel", () => {
    render(
      <CalendarScreen
        initialMonth="2026-08"
        selectableMonths={["2026-08"]}
        monthsCells={{ "2026-08": buildMonthCells("2026-08", { "2026-08-10": { hasCharges: true } }) }}
        daysByDate={{
          "2026-08-10": {
            date: "2026-08-10",
            closingBalanceCents: 100000,
            isNegative: false,
            occurrences: [{ definitionId: "rec-1", description: "Renta", amountCents: 12000, kind: "outflow" as const, overdue: false }],
          },
        }}
        fromDate="2026-08-06"
        formattedAnchor="$1,500.00"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /2026-08-10/ }));

    expect(screen.getByText("Renta")).toBeInTheDocument();
  });

  it("marks a folded-overdue occurrence as overdue in the panel", () => {
    render(
      <CalendarScreen
        initialMonth="2026-08"
        selectableMonths={["2026-08"]}
        monthsCells={{ "2026-08": buildMonthCells("2026-08") }}
        daysByDate={{
          "2026-08-06": {
            date: "2026-08-06",
            closingBalanceCents: 50000,
            isNegative: false,
            occurrences: [{ definitionId: "rec-2", description: "Gimnasio", amountCents: 8000, kind: "outflow" as const, overdue: true }],
          },
        }}
        fromDate="2026-08-06"
        formattedAnchor="$1,500.00"
      />,
    );

    expect(screen.getByText("Gimnasio")).toBeInTheDocument();
    expect(screen.getByText("Vencida")).toBeInTheDocument();
  });
});
