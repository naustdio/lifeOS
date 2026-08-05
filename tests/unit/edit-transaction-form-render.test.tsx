import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Closes verify-report-2c Issue C-1 for `EditTransactionForm` (T-038): an
 * RTL smoke-render proving the component mounts for a representative
 * income transaction and a representative transfer-leg transaction, and
 * that the transfer-leg-reject remedy path (design.md §5.4,
 * `TRANSFER_LEG_NOT_MOVABLE` -> "Anular y volver a registrar") actually
 * renders when the edit action reports that error — never proven before
 * (the existing integration test only calls the Server Actions directly,
 * never mounts this component).
 *
 * `updateMovementAction`/`voidMovementAction` are mocked at the module the
 * component imports them from so the transfer-leg-reject branch can be
 * driven deterministically from a submitted form, without a real network
 * call.
 */

const updateMovementAction = vi.fn();
const voidMovementAction = vi.fn();

vi.mock("@/app/(app)/movimientos/actions", () => ({
  updateMovementAction,
  voidMovementAction,
}));

const { EditTransactionForm } = await import(
  "@/app/(app)/movimientos/[id]/editar/EditTransactionForm"
);

const ACCOUNTS = [
  { id: "acc-1", name: "Cuenta A" },
  { id: "acc-2", name: "Cuenta B" },
];
const CATEGORIES = [{ id: "cat-1", name: "Café" }];

const INCOME_TRANSACTION = {
  id: "tx-1",
  accountId: "acc-1",
  categoryId: "cat-1",
  type: "income" as const,
  amountCents: 5000,
  occurredOn: "2026-02-01",
  description: "Sueldo",
};

const TRANSFER_LEG_TRANSACTION = {
  id: "tx-2",
  accountId: "acc-1",
  categoryId: null,
  type: "transfer" as const,
  amountCents: -1000,
  occurredOn: "2026-02-02",
  description: "Ahorro",
};

const BUDGETED_EXPENSE_TRANSACTION = {
  id: "tx-3",
  accountId: "acc-1",
  categoryId: "cat-1",
  type: "expense" as const,
  amountCents: -1000,
  occurredOn: "2026-02-03",
  description: "Café",
};
const BUDGETS = [{ budgetId: "b1", categoryId: "cat-1", limitCents: 4500, spentCents: 4500 }];

describe("EditTransactionForm — smoke render (T-038 / C-1)", () => {
  afterEach(() => {
    cleanup();
    updateMovementAction.mockReset();
    voidMovementAction.mockReset();
  });

  it("renders without throwing for a representative income transaction, with a category field", () => {
    render(
      <EditTransactionForm transaction={INCOME_TRANSACTION} accounts={ACCOUNTS} categories={CATEGORIES} />,
    );

    expect(screen.getByLabelText("Cuenta")).toBeInTheDocument();
    expect(screen.getByLabelText("Categoría")).toBeInTheDocument();
    expect(screen.getByLabelText("Monto (MXN)")).toHaveValue(50);
    expect(screen.getByRole("button", { name: "Anular movimiento" })).toBeInTheDocument();
  });

  it("renders without throwing for a representative transfer-leg transaction, hiding the category field", () => {
    render(
      <EditTransactionForm
        transaction={TRANSFER_LEG_TRANSACTION}
        accounts={ACCOUNTS}
        categories={CATEGORIES}
      />,
    );

    expect(screen.getByLabelText("Cuenta")).toBeInTheDocument();
    expect(screen.queryByLabelText("Categoría")).not.toBeInTheDocument();
    // No error yet, so the void button still shows the default label.
    expect(screen.getByRole("button", { name: "Anular movimiento" })).toBeInTheDocument();
  });

  it("relabels the void button to the transfer-leg-reject remedy once the edit action reports TRANSFER_LEG_NOT_MOVABLE", async () => {
    updateMovementAction.mockResolvedValue({
      error: "Una transferencia no se puede mover de cuenta; anúlala y regístrala de nuevo.",
    });

    render(
      <EditTransactionForm
        transaction={TRANSFER_LEG_TRANSACTION}
        accounts={ACCOUNTS}
        categories={CATEGORIES}
      />,
    );

    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    saveButton.closest("form")?.requestSubmit();

    await waitFor(() => {
      expect(
        screen.getByText("Una transferencia no se puede mover de cuenta; anúlala y regístrala de nuevo."),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Anular y volver a registrar" })).toBeInTheDocument();
  });
});

/**
 * Over-budget confirmation gate on edit (finance-budgets B-008/B-011):
 * raising the amount past the limit prompts; lowering it does not;
 * switching to a budgeted category over its limit prompts.
 */
describe("EditTransactionForm — over-budget confirmation gate (B-011)", () => {
  afterEach(() => {
    cleanup();
    updateMovementAction.mockReset();
    voidMovementAction.mockReset();
  });

  it("prompts when raising the amount past the limit", () => {
    render(
      <EditTransactionForm
        transaction={BUDGETED_EXPENSE_TRANSACTION}
        accounts={ACCOUNTS}
        categories={CATEGORIES}
        budgets={BUDGETS}
      />,
    );

    fireEvent.change(screen.getByLabelText("Monto (MXN)"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(screen.getByText("Vas a superar tu presupuesto")).toBeInTheDocument();
  });

  it("does not prompt when lowering the amount", () => {
    updateMovementAction.mockResolvedValue({ error: null });
    render(
      <EditTransactionForm
        transaction={BUDGETED_EXPENSE_TRANSACTION}
        accounts={ACCOUNTS}
        categories={CATEGORIES}
        budgets={BUDGETS}
      />,
    );

    fireEvent.change(screen.getByLabelText("Monto (MXN)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(screen.queryByText("Vas a superar tu presupuesto")).not.toBeInTheDocument();
  });

  it("prompts when switching to a budgeted category whose limit the amount would cross", () => {
    const unbudgetedTransaction = {
      id: "tx-4",
      accountId: "acc-1",
      categoryId: null,
      type: "expense" as const,
      amountCents: -1000,
      occurredOn: "2026-02-04",
      description: "Sin categoría",
    };

    render(
      <EditTransactionForm
        transaction={unbudgetedTransaction}
        accounts={ACCOUNTS}
        categories={CATEGORIES}
        budgets={BUDGETS}
      />,
    );

    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: "cat-1" } });
    fireEvent.change(screen.getByLabelText("Monto (MXN)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(screen.getByText("Vas a superar tu presupuesto")).toBeInTheDocument();
  });
});
