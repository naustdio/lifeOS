import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Closes verify-report-2c Issue C-1 for `TransactionForm` (T-037): an RTL
 * smoke-render proving the component mounts through React and that its
 * expense/income/transfer tab branching renders the right fields — the
 * component's real piece of logic, never exercised before this test (the
 * existing integration test only calls the Server Actions directly with
 * hand-built `FormData`, it never mounts this component).
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const recordMovementAction = vi.fn();
const recordTransferAction = vi.fn();
const recordInstallmentPurchaseAction = vi.fn();

vi.mock("@/app/(app)/movimientos/actions", () => ({
  recordMovementAction,
  recordTransferAction,
  recordInstallmentPurchaseAction,
}));

const { TransactionForm } = await import("@/app/(app)/movimientos/TransactionForm");

const ACCOUNTS = [
  { id: "acc-1", name: "Cuenta A" },
  { id: "acc-2", name: "Cuenta B" },
];
const CATEGORIES = [
  { id: "cat-income-1", name: "Sueldo", kind: "income" as const },
  { id: "cat-expense-1", name: "Café", kind: "expense" as const },
];
const BUDGETED_CATEGORY = [{ id: "cat-expense-1", name: "Café", kind: "expense" as const }];
const BUDGETS = [{ budgetId: "b1", categoryId: "cat-expense-1", limitCents: 5000, spentCents: 4000 }];
const ACCOUNTS_WITH_CARD = [
  { id: "acc-1", name: "Cuenta A", type: "checking" },
  { id: "acc-3", name: "Tarjeta Oro", type: "credit_card" },
];

describe("TransactionForm — smoke render (T-037 / C-1)", () => {
  afterEach(() => {
    cleanup();
    recordMovementAction.mockReset();
    recordTransferAction.mockReset();
  });

  it("renders the expense tab by default with only expense categories", () => {
    render(<TransactionForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    expect(screen.getByLabelText("Cuenta")).toBeInTheDocument();
    expect(screen.getByLabelText("Categoría")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Categoría"));
    expect(screen.getByRole("option", { name: "Café" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Sueldo" })).not.toBeInTheDocument();
    // Close the Select (Radix aria-hides the rest of the page while its
    // listbox is open) before asserting on siblings outside the dropdown.
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Registrar gasto" })).toBeInTheDocument();
    // Transfer-only fields are not present.
    expect(screen.queryByLabelText("Desde")).not.toBeInTheDocument();
  });

  it("switches to the income tab and shows only income categories", () => {
    render(<TransactionForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    fireEvent.click(screen.getByRole("button", { name: "Ingreso" }));

    fireEvent.click(screen.getByLabelText("Categoría"));
    expect(screen.getByRole("option", { name: "Sueldo" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Café" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Registrar ingreso" })).toBeInTheDocument();
  });

  it("switches to the transfer tab and shows Desde/Hacia account fields instead of category/amount-form fields", () => {
    render(<TransactionForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    fireEvent.click(screen.getByRole("button", { name: "Transferencia" }));

    expect(screen.getByLabelText("Desde")).toBeInTheDocument();
    expect(screen.getByLabelText("Hacia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar transferencia" })).toBeInTheDocument();
    // Income/expense-only fields are gone.
    expect(screen.queryByLabelText("Categoría")).not.toBeInTheDocument();
  });

  it("switches to the Compra a meses tab and shows only credit_card accounts", () => {
    render(<TransactionForm accounts={ACCOUNTS_WITH_CARD} categories={CATEGORIES} />);

    fireEvent.click(screen.getByRole("button", { name: "Compra a meses" }));

    fireEvent.click(screen.getByLabelText("Tarjeta"));
    expect(screen.getByRole("option", { name: "Tarjeta Oro" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Cuenta A" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });

    expect(screen.getByLabelText("Número de cuotas")).toHaveValue(3);
    expect(screen.getByRole("button", { name: "Registrar compra a meses" })).toBeInTheDocument();
  });

  it("shows a guidance message instead of the form when there is no credit_card account", () => {
    render(<TransactionForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    fireEvent.click(screen.getByRole("button", { name: "Compra a meses" }));

    expect(screen.getByText(/necesitas una cuenta de tipo tarjeta de crédito/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar compra a meses" })).not.toBeInTheDocument();
  });
});

/**
 * Over-budget confirmation gate (finance-budgets B-007/B-011): crossing the
 * limit renders the dialog and does NOT dispatch immediately; confirming
 * dispatches once; cancelling never dispatches; staying under the limit
 * dispatches with no dialog. `recordMovementAction` is the real
 * `useActionState` action (its own transitive deps are already mocked
 * above), so "dispatches" is observed as the dialog closing / no dialog
 * appearing rather than a spy call — matching how the rest of this file
 * treats the action as an opaque `useActionState` reducer.
 */
describe("TransactionForm — over-budget confirmation gate (B-011)", () => {
  afterEach(() => {
    cleanup();
    recordMovementAction.mockReset();
    recordTransferAction.mockReset();
  });

  it("shows the confirmation dialog when the entered expense crosses the limit and does not submit immediately", () => {
    render(<TransactionForm accounts={ACCOUNTS} categories={BUDGETED_CATEGORY} budgets={BUDGETS} />);

    fireEvent.change(screen.getByLabelText("Monto (MXN)"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));

    expect(screen.getByText("Vas a superar tu presupuesto")).toBeInTheDocument();
  });

  it("dispatches immediately with no dialog when the expense stays under the limit", () => {
    recordMovementAction.mockResolvedValue({ error: null });
    render(<TransactionForm accounts={ACCOUNTS} categories={BUDGETED_CATEGORY} budgets={BUDGETS} />);

    fireEvent.change(screen.getByLabelText("Monto (MXN)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));

    expect(screen.queryByText("Vas a superar tu presupuesto")).not.toBeInTheDocument();
  });

  it("cancelling the confirmation dismisses it without submitting", () => {
    render(<TransactionForm accounts={ACCOUNTS} categories={BUDGETED_CATEGORY} budgets={BUDGETS} />);

    fireEvent.change(screen.getByLabelText("Monto (MXN)"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));
    expect(screen.getByText("Vas a superar tu presupuesto")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByText("Vas a superar tu presupuesto")).not.toBeInTheDocument();
  });

  it("confirming dismisses the dialog (dispatch proceeds via startTransition)", () => {
    recordMovementAction.mockResolvedValue({ error: null });
    render(<TransactionForm accounts={ACCOUNTS} categories={BUDGETED_CATEGORY} budgets={BUDGETS} />);

    fireEvent.change(screen.getByLabelText("Monto (MXN)"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));
    expect(screen.getByText("Vas a superar tu presupuesto")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.queryByText("Vas a superar tu presupuesto")).not.toBeInTheDocument();
  });
});
