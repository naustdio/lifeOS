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
vi.mock("@/app/(app)/recurrentes/actions", () => ({
  discardRecurringAction,
  setRecurringActiveAction,
  deleteRecurringAction,
  confirmRecurringAction,
}));

const { RecurringList } = await import("@/app/(app)/recurrentes/RecurringList");

const ACCOUNTS = [{ id: "acc-1", name: "Efectivo" }];
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
        categoryId: "cat-1",
        amountCents: 12000,
        description: "Renta",
        frequency: "monthly" as const,
        nextDueDate: "2026-07-25",
        active: true,
      },
      {
        id: "rec-2",
        accountId: "acc-1",
        categoryId: "cat-1",
        amountCents: 5000,
        description: "Internet",
        frequency: "monthly" as const,
        nextDueDate: "2026-09-01",
        active: true,
      },
    ];
    const dueItems = [
      {
        recurringId: "rec-1",
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
        categoryId: "cat-1",
        amountCents: 8000,
        description: "Gimnasio",
        frequency: "monthly" as const,
        nextDueDate: "2026-08-01",
        active: false,
      },
    ];

    render(<RecurringList definitions={definitions} dueItems={[]} accounts={ACCOUNTS} categories={CATEGORIES} budgets={[]} />);

    expect(screen.getByText(/En pausa/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Omitir" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reanudar" })).toBeInTheDocument();
  });

  it("clicking Confirmar opens the ConfirmRecurringSheet prefilled with the due item", () => {
    const definitions = [
      {
        id: "rec-4",
        accountId: "acc-1",
        categoryId: "cat-1",
        amountCents: 12000,
        description: "Renta",
        frequency: "monthly" as const,
        nextDueDate: "2026-08-06",
        active: true,
      },
    ];
    const dueItems = [
      {
        recurringId: "rec-4",
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
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-08-06");
  });
});
