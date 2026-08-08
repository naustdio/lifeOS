import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RTL coverage for the sub-type `<Select>` in `TransactionForm`/`EditTransactionForm`
 * (design.md §6, change: finance-transaction-subtypes, tasks.md T-009). RED-first: written
 * before either form renders a sub-type Select and must fail.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const recordMovementAction = vi.fn();
const recordTransferAction = vi.fn();
const updateMovementAction = vi.fn();
const voidMovementAction = vi.fn();

vi.mock("@/app/(app)/movimientos/actions", () => ({
  recordMovementAction,
  recordTransferAction,
  recordInstallmentPurchaseAction: vi.fn(),
  updateMovementAction,
  voidMovementAction,
}));

const { TransactionForm } = await import("@/app/(app)/movimientos/TransactionForm");
const { EditTransactionForm } = await import(
  "@/app/(app)/movimientos/[id]/editar/EditTransactionForm"
);

const ACCOUNTS = [
  { id: "acc-1", name: "Cuenta A" },
  { id: "acc-2", name: "Cuenta B" },
];
const CATEGORIES = [
  { id: "cat-income-1", name: "Sueldo", kind: "income" as const },
  { id: "cat-expense-1", name: "Café", kind: "expense" as const },
];

describe("TransactionForm — sub-type Select (T-009)", () => {
  afterEach(() => {
    cleanup();
    recordMovementAction.mockReset();
    recordTransferAction.mockReset();
  });

  it("expense tab shows exactly 'Sin subtipo' and 'Pago' as sub-type options", () => {
    render(<TransactionForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    fireEvent.click(screen.getByLabelText("Sub-tipo"));
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Sin subtipo", "Pago"]);
  });

  it("switching to income resets the sub-type selection and shows the income options", () => {
    render(<TransactionForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    fireEvent.click(screen.getByRole("button", { name: "Ingreso" }));

    fireEvent.click(screen.getByLabelText("Sub-tipo"));
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Sin subtipo", "Reembolso", "Devolución en efectivo"]);
    // the trigger itself shows the reset default, not a stale expense-tab value
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.getByLabelText("Sub-tipo")).toHaveTextContent("Sin subtipo");
  });

  it("transfer tab shows exactly 'Sin subtipo' and 'Pago de tarjeta'", () => {
    render(<TransactionForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    fireEvent.click(screen.getByRole("button", { name: "Transferencia" }));

    fireEvent.click(screen.getByLabelText("Sub-tipo"));
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Sin subtipo", "Pago de tarjeta"]);
  });

  it("never offers compra_meses as a sub-type option on any tab (it has its own dedicated tab instead)", () => {
    render(<TransactionForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    for (const tabLabel of ["Gasto", "Ingreso", "Transferencia"]) {
      fireEvent.click(screen.getByRole("button", { name: tabLabel }));
      fireEvent.click(screen.getByLabelText("Sub-tipo"));
      // Scoped to the sub-type listbox's own options — the "Compra a meses" TAB button
      // legitimately contains "meses" and lives outside this listbox, so a page-wide text
      // query would false-positive on it.
      const optionLabels = screen.getAllByRole("option").map((o) => o.textContent);
      expect(optionLabels.some((label) => /mensualidades|meses/i.test(label ?? ""))).toBe(false);
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    }
  });
});

describe("EditTransactionForm — sub-type Select (T-009)", () => {
  afterEach(() => {
    cleanup();
    updateMovementAction.mockReset();
    voidMovementAction.mockReset();
  });

  it("pre-selects the transaction's stored subtype", () => {
    render(
      <EditTransactionForm
        transaction={{
          id: "tx-1",
          accountId: "acc-1",
          categoryId: "cat-expense-1",
          type: "expense",
          amountCents: -1000,
          occurredOn: "2026-02-01",
          description: "Café",
          subtype: "pago",
        }}
        accounts={ACCOUNTS}
        categories={[{ id: "cat-expense-1", name: "Café" }]}
      />,
    );

    expect(screen.getByLabelText("Sub-tipo")).toHaveTextContent("Pago");
  });

  it("choosing 'Sin subtipo' submits a clear (null) on save", async () => {
    updateMovementAction.mockResolvedValue({ error: null });
    render(
      <EditTransactionForm
        transaction={{
          id: "tx-1",
          accountId: "acc-1",
          categoryId: "cat-expense-1",
          type: "expense",
          amountCents: -1000,
          occurredOn: "2026-02-01",
          description: "Café",
          subtype: "pago",
        }}
        accounts={ACCOUNTS}
        categories={[{ id: "cat-expense-1", name: "Café" }]}
      />,
    );

    fireEvent.click(screen.getByLabelText("Sub-tipo"));
    fireEvent.click(screen.getByRole("option", { name: "Sin subtipo" }));

    const saveButton = screen.getByRole("button", { name: "Guardar cambios" });
    saveButton.closest("form")?.requestSubmit();

    expect(updateMovementAction).toHaveBeenCalled();
  });
});
