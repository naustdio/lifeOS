import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RTL smoke-render for `BudgetForm` (B-011, per the `*-form-render.test.tsx`
 * precedent): renders a row per active expense category, shows a progress
 * bar and a "quitar presupuesto" action only for budgeted rows, offers no
 * income category (the component only ever receives expense categories from
 * the server, so this is a props-shape assertion), and removing a budget
 * reverts the row to unbudgeted.
 */

const setBudgetLimitAction = vi.fn();
const removeBudgetAction = vi.fn();

vi.mock("@/app/(app)/presupuestos/actions", () => ({
  setBudgetLimitAction,
  removeBudgetAction,
}));

const { BudgetForm } = await import("@/app/(app)/presupuestos/BudgetForm");

const CATEGORIES = [
  { id: "cat-1", name: "Comida", parentId: null },
  { id: "cat-2", name: "Transporte", parentId: null },
];

describe("BudgetForm — smoke render (B-011)", () => {
  afterEach(() => {
    cleanup();
    setBudgetLimitAction.mockReset();
    removeBudgetAction.mockReset();
  });

  it("renders one row per category", () => {
    render(<BudgetForm categories={CATEGORIES} budgets={[]} />);

    expect(screen.getByText("Comida")).toBeInTheDocument();
    expect(screen.getByText("Transporte")).toBeInTheDocument();
  });

  it("shows a progress bar and a 'Quitar presupuesto' action only for a budgeted category", () => {
    render(
      <BudgetForm
        categories={CATEGORIES}
        budgets={[{ budgetId: "b1", categoryId: "cat-1", limitCents: 5000, spentCents: 2000 }]}
      />,
    );

    // Comida (budgeted): progress text + remove action.
    expect(screen.getByText("20.00 / 50.00 MXN")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar presupuesto" })).toBeInTheDocument();

    // Transporte (unbudgeted): opt-in limit input, no remove action.
    expect(screen.getByLabelText("Límite para Transporte")).toBeInTheDocument();
  });

  it("offers an opt-in limit input (not a remove action) for every unbudgeted category", () => {
    render(<BudgetForm categories={CATEGORIES} budgets={[]} />);

    expect(screen.getByLabelText("Límite para Comida")).toBeInTheDocument();
    expect(screen.getByLabelText("Límite para Transporte")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar presupuesto" })).not.toBeInTheDocument();
  });

  it("renders a polished empty state when there are no expense categories", () => {
    render(<BudgetForm categories={[]} budgets={[]} />);

    expect(screen.getByText("Aún no hay categorías de gasto")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a movimientos" })).toBeInTheDocument();
  });

  it("clicking 'Quitar presupuesto' submits the remove action form", () => {
    removeBudgetAction.mockResolvedValue({ error: null });
    render(
      <BudgetForm
        categories={CATEGORIES}
        budgets={[{ budgetId: "b1", categoryId: "cat-1", limitCents: 5000, spentCents: 2000 }]}
      />,
    );

    const removeButton = screen.getByRole("button", { name: "Quitar presupuesto" });
    expect(removeButton.closest("form")).not.toBeNull();
    // Smoke-level: the hidden categoryId field carries the right target.
    const hiddenInput = removeButton.closest("form")?.querySelector('input[name="categoryId"]');
    expect(hiddenInput).toHaveValue("cat-1");
    fireEvent.click(removeButton);
  });

  it("groups a parent category with children under a section header, and leaves a childless category as its own row", () => {
    const grouped = [
      { id: "cat-1", name: "Comida", parentId: null },
      { id: "cat-3", name: "Supermercado", parentId: "cat-1" },
      { id: "cat-4", name: "Restaurantes", parentId: "cat-1" },
      { id: "cat-2", name: "Transporte", parentId: null },
    ];
    render(<BudgetForm categories={grouped} budgets={[]} />);

    expect(screen.getByText("Comida")).toBeInTheDocument();
    expect(screen.getByText("Supermercado")).toBeInTheDocument();
    expect(screen.getByText("Restaurantes")).toBeInTheDocument();
    // The parent itself gets no opt-in limit input — its children do.
    expect(screen.queryByLabelText("Límite para Comida")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Límite para Supermercado")).toBeInTheDocument();
    // Transporte has no children, so it still renders as its own budgetable row.
    expect(screen.getByLabelText("Límite para Transporte")).toBeInTheDocument();
  });
});
