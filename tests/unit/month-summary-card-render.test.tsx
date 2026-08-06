import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MonthSummaryCard } from "@/design-system/patterns/MonthSummaryCard";

/**
 * RTL render for `MonthSummaryCard` (design.md §8, change: finance-dashboard-feed F-011).
 */
describe("MonthSummaryCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders both formatted figures and the month label", () => {
    render(
      <MonthSummaryCard
        monthLabel="Agosto 2026"
        incomeCents={500000}
        expenseCents={150000}
        formattedIncome="$5,000.00"
        formattedExpense="$1,500.00"
      />,
    );

    expect(screen.getByText("Agosto 2026")).toBeInTheDocument();
    expect(screen.getByText("Ingresos")).toBeInTheDocument();
    expect(screen.getByText("Gastos")).toBeInTheDocument();
    expect(screen.getByText("$5,000.00")).toBeInTheDocument();
    expect(screen.getByText("$1,500.00")).toBeInTheDocument();
  });

  it("renders the EmptyState with a CTA linking to /movimientos when income and expense are both zero", () => {
    render(
      <MonthSummaryCard
        monthLabel="Agosto 2026"
        incomeCents={0}
        expenseCents={0}
        formattedIncome="$0.00"
        formattedExpense="$0.00"
      />,
    );

    expect(screen.getByText("Aún no hay movimientos este mes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nueva transacción" })).toHaveAttribute("href", "/movimientos");
    expect(screen.queryByText("Agosto 2026")).not.toBeInTheDocument();
  });
});
