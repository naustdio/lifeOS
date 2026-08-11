import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RTL smoke-render for `RecurringList` (design.md §11, change: finance-recurring R-022):
 * due-first ordering, `Vencida hace 12 días` copy, paused rows offer no confirm/omit actions,
 * `EmptyState` renders on zero definitions.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const discardRecurringAction = vi.fn();
const setRecurringActiveAction = vi.fn();
const deleteRecurringAction = vi.fn();
const confirmRecurringAction = vi.fn();
vi.mock("@/app/(app)/(finance)/recurrentes/actions", () => ({
  discardRecurringAction,
  setRecurringActiveAction,
  deleteRecurringAction,
  confirmRecurringAction,
}));

const { RecurringList } = await import("@/app/(app)/(finance)/recurrentes/RecurringList");

const ACCOUNTS = [
  { id: "acc-1", name: "Efectivo", class: "asset" as const },
  { id: "acc-2", name: "Tarjeta Oro", class: "liability" as const },
];
const CATEGORIES = [{ id: "cat-1", name: "Renta" }];

describe("RecurringList — smoke render (R-022)", () => {
  afterEach(() => {
    cleanup();
    discardRecurringAction.mockReset();
    setRecurringActiveAction.mockReset();
    deleteRecurringAction.mockReset();
    confirmRecurringAction.mockReset();
  });

  it("renders EmptyState when there are zero definitions", () => {
    render(<RecurringList definitions={[]} dueItems={[]} accounts={ACCOUNTS} categories={CATEGORIES} budgets={[]} />);

    expect(screen.getByText("Aún no tienes recurrentes")).toBeInTheDocument();
  });

  it("renders due-first, with 'Vencida hace 12 días' copy for a 12-day-overdue item", () => {
    const definitions = [
      {
        id: "rec-1",
        accountId: "acc-1",
        type: "expense" as const,
        toAccountId: null,
        categoryId: "cat-1",
        amountCents: 12000,
        description: "Renta",
        frequency: "monthly" as const,
        nextDueDate: "2026-07-25",
        active: true,
        installmentsRemaining: null,
        installmentTotal: null,
        isSubscription: false,
      },
      {
        id: "rec-2",
        accountId: "acc-1",
        type: "expense" as const,
        toAccountId: null,
        categoryId: "cat-1",
        amountCents: 5000,
        description: "Internet",
        frequency: "monthly" as const,
        nextDueDate: "2026-09-01",
        active: true,
        installmentsRemaining: null,
        installmentTotal: null,
        isSubscription: false,
      },
    ];
    const dueItems = [
      {
        recurringId: "rec-1",
        type: "expense" as const,
        toAccountId: null,
        amountCents: 12000,
        description: "Renta",
        frequency: "monthly" as const,
        nextDueDate: "2026-07-25",
        daysOverdue: 12,
      },
    ];

    render(
      <RecurringList definitions={definitions} dueItems={dueItems} accounts={ACCOUNTS} categories={CATEGORIES} budgets={[]} />,
    );

    expect(screen.getByText(/Vencida hace 12 días/)).toBeInTheDocument();

    const rows = screen.getAllByText(/Renta|Internet/);
    expect(rows[0]).toHaveTextContent("Renta");
  });

  it("a paused definition reads 'En pausa' and offers no confirm/omit actions", () => {
    const definitions = [
      {
        id: "rec-3",
        accountId: "acc-1",
        type: "expense" as const,
        toAccountId: null,
        categoryId: "cat-1",
        amountCents: 8000,
        description: "Gimnasio",
        frequency: "monthly" as const,
        nextDueDate: "2026-08-01",
        active: false,
        installmentsRemaining: null,
        installmentTotal: null,
        isSubscription: false,
      },
    ];

    render(<RecurringList definitions={definitions} dueItems={[]} accounts={ACCOUNTS} categories={CATEGORIES} budgets={[]} />);

    expect(screen.getByText(/En pausa/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Omitir" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reanudar" })).toBeInTheDocument();
  });

  it("an installment-purchase definition shows the remaining-payments badge, hides Omitir, and offers early payoff instead of Eliminar", () => {
    const definitions = [
      {
        id: "rec-6",
        accountId: "acc-1",
        type: "expense" as const,
        toAccountId: null,
        categoryId: "cat-1",
        amountCents: 33333,
        description: "Consola (2/4)",
        frequency: "monthly" as const,
        nextDueDate: "2026-08-01",
        active: true,
        installmentsRemaining: 2,
        installmentTotal: 4,
        isSubscription: false,
      },
    ];

    render(<RecurringList definitions={definitions} dueItems={[]} accounts={ACCOUNTS} categories={CATEGORIES} budgets={[]} />);

    expect(screen.getByText(/Quedan 2 de 4 pagos/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Omitir" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar antes de tiempo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
  });

  /**
   * Closes a real spec/test coverage gap flagged by sdd-verify (finance-subscriptions,
   * finding C2): every existing fixture hardcoded `isSubscription: false`, so the
   * `isSubscription && " · Suscripción"` branch in `RecurringRow` (RecurringRow.tsx:85) was
   * never exercised by any test. Spec requires `RecurringList` to render a visual indicator
   * on any definition where the flag is `true`.
   */
  it("a subscription definition renders the '· Suscripción' badge", () => {
    const definitions = [
      {
        id: "rec-7",
        accountId: "acc-1",
        type: "expense" as const,
        toAccountId: null,
        categoryId: "cat-1",
        amountCents: 9900,
        description: "Netflix",
        frequency: "monthly" as const,
        nextDueDate: "2026-08-20",
        active: true,
        installmentsRemaining: null,
        installmentTotal: null,
        isSubscription: true,
      },
    ];

    render(<RecurringList definitions={definitions} dueItems={[]} accounts={ACCOUNTS} categories={CATEGORIES} budgets={[]} />);

    expect(screen.getByText(/· Suscripción/)).toBeInTheDocument();
  });

  /**
   * Closes a real spec/test coverage gap flagged by sdd-verify (finance-subscriptions, finding
   * C2 — scenario 2.3 "Unmarked definitions show no indicator"). The positive-branch test above
   * proves the badge renders when `isSubscription: true`; nothing previously asserted its
   * absence, so deleting the `isSubscription && " · Suscripción"` guard in `RecurringRow.tsx`
   * (making the badge always render) would still leave the whole suite green.
   */
  it("an unmarked (isSubscription: false) definition renders no '· Suscripción' indicator", () => {
    const definitions = [
      {
        id: "rec-8",
        accountId: "acc-1",
        type: "expense" as const,
        toAccountId: null,
        categoryId: "cat-1",
        amountCents: 9900,
        description: "Netflix",
        frequency: "monthly" as const,
        nextDueDate: "2026-08-20",
        active: true,
        installmentsRemaining: null,
        installmentTotal: null,
        isSubscription: false,
      },
    ];

    render(<RecurringList definitions={definitions} dueItems={[]} accounts={ACCOUNTS} categories={CATEGORIES} budgets={[]} />);

    expect(screen.queryByText(/· Suscripción/)).not.toBeInTheDocument();
  });

  it("clicking Confirmar opens the ConfirmRecurringSheet prefilled with the due item", () => {
    const definitions = [
      {
        id: "rec-4",
        accountId: "acc-1",
        type: "expense" as const,
        toAccountId: null,
        categoryId: "cat-1",
        amountCents: 12000,
        description: "Renta",
        frequency: "monthly" as const,
        nextDueDate: "2026-08-06",
        active: true,
        installmentsRemaining: null,
        installmentTotal: null,
        isSubscription: false,
      },
    ];
    const dueItems = [
      {
        recurringId: "rec-4",
        type: "expense" as const,
        toAccountId: null,
        amountCents: 12000,
        description: "Renta",
        frequency: "monthly" as const,
        nextDueDate: "2026-08-06",
        daysOverdue: 0,
      },
    ];

    render(
      <RecurringList definitions={definitions} dueItems={dueItems} accounts={ACCOUNTS} categories={CATEGORIES} budgets={[]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(screen.getByText("Confirmar recurrente")).toBeInTheDocument();
    // DatePicker's visible trigger is a button (labelled via htmlFor); the ISO value lives on
    // its paired hidden input, same "hidden native input" contract Select already establishes.
    const hidden = document.querySelector('input[name="occurredOn"]');
    expect(hidden).toHaveValue("2026-08-06");
  });

  /**
   * Closes a real spec/test coverage gap flagged by sdd-verify (verify-report.md, WARNING 1):
   * `ConfirmRecurringSheet` reuses `evaluateBudgetImpact`/`OverBudgetDialog` byte-identically to
   * `TransactionForm`, but no RTL test exercised that branch through this entry point.
   */
  describe("ConfirmRecurringSheet — over-budget confirmation gate", () => {
    const definitions = [
      {
        id: "rec-5",
        accountId: "acc-1",
        type: "expense" as const,
        toAccountId: null,
        categoryId: "cat-1",
        amountCents: 2000,
        description: "Renta",
        frequency: "monthly" as const,
        nextDueDate: "2026-08-06",
        active: true,
        installmentsRemaining: null,
        installmentTotal: null,
        isSubscription: false,
      },
    ];
    const dueItems = [
      {
        recurringId: "rec-5",
        type: "expense" as const,
        toAccountId: null,
        amountCents: 2000,
        description: "Renta",
        frequency: "monthly" as const,
        nextDueDate: "2026-08-06",
        daysOverdue: 0,
      },
    ];
    const BUDGETS = [{ budgetId: "b1", categoryId: "cat-1", limitCents: 5000, spentCents: 4000 }];

    function openSheet() {
      render(
        <RecurringList
          definitions={definitions}
          dueItems={dueItems}
          accounts={ACCOUNTS}
          categories={CATEGORIES}
          budgets={BUDGETS}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    }

    // The row's own "Confirmar" button (opens the sheet) stays in the DOM behind the sheet
    // overlay, and the sheet's submit button is ALSO labeled "Confirmar" — both coexist once
    // the sheet is open, so submitting must target the last match (the sheet's).
    function submitSheet() {
      const confirmButtons = screen.getAllByRole("button", { name: "Confirmar" });
      fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    }

    it("shows the confirmation dialog when the confirmed amount crosses the limit and does not submit immediately", () => {
      openSheet();

      fireEvent.change(screen.getByLabelText("Monto (MXN)"), { target: { value: "20" } });
      submitSheet();

      expect(screen.getByText("Vas a superar tu presupuesto")).toBeInTheDocument();
      expect(confirmRecurringAction).not.toHaveBeenCalled();
    });

    it("dispatches immediately with no dialog when the confirmed amount stays under the limit", () => {
      confirmRecurringAction.mockResolvedValue({ error: null });
      openSheet();

      fireEvent.change(screen.getByLabelText("Monto (MXN)"), { target: { value: "5" } });
      submitSheet();

      expect(screen.queryByText("Vas a superar tu presupuesto")).not.toBeInTheDocument();
    });

    it("cancelling the over-budget dialog dismisses it without submitting", () => {
      openSheet();

      fireEvent.change(screen.getByLabelText("Monto (MXN)"), { target: { value: "20" } });
      submitSheet();

      // Two "Cancelar" buttons exist once the dialog is open (the sheet's own, and the
      // OverBudgetDialog's) — the dialog's renders last in the tree.
      const cancelButtons = screen.getAllByRole("button", { name: "Cancelar" });
      fireEvent.click(cancelButtons[cancelButtons.length - 1]);

      expect(screen.queryByText("Vas a superar tu presupuesto")).not.toBeInTheDocument();
      expect(confirmRecurringAction).not.toHaveBeenCalled();
    });
  });

  // finance-credit-card-payments CC-025/CC-027: a transfer-type definition's row renders
  // "Origen -> Destino" (never a category chip, since categoryId is null by DB shape CHECK), and
  // its ConfirmRecurringSheet states explicitly that confirming posts the payment now.
  describe("transfer-type definitions (auto-pay)", () => {
    const definitions = [
      {
        id: "rec-6",
        accountId: "acc-1",
        type: "transfer" as const,
        toAccountId: "acc-2",
        categoryId: null,
        amountCents: 30000,
        description: "Pago tarjeta oro",
        frequency: "monthly" as const,
        nextDueDate: "2026-08-06",
        active: true,
        installmentsRemaining: null,
        installmentTotal: null,
        isSubscription: false,
      },
    ];
    const dueItems = [
      {
        recurringId: "rec-6",
        type: "transfer" as const,
        toAccountId: "acc-2",
        amountCents: 30000,
        description: "Pago tarjeta oro",
        frequency: "monthly" as const,
        nextDueDate: "2026-08-06",
        daysOverdue: 0,
      },
    ];

    it("renders 'Efectivo -> Tarjeta Oro' on the row, with no category chip", () => {
      render(
        <RecurringList definitions={definitions} dueItems={dueItems} accounts={ACCOUNTS} categories={CATEGORIES} budgets={[]} />,
      );

      expect(screen.getByText("Efectivo → Tarjeta Oro")).toBeInTheDocument();
    });

    it("the confirm sheet states explicitly that confirming posts the payment now", () => {
      render(
        <RecurringList definitions={definitions} dueItems={dueItems} accounts={ACCOUNTS} categories={CATEGORIES} budgets={[]} />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

      expect(screen.getByText(/Al confirmar se registrará este pago ahora/)).toBeInTheDocument();
    });
  });
});
