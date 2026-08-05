import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RTL smoke-render for the Movimientos list screen (finance-ui-polish
 * P-021), mirroring `tests/unit/account-form-render.test.tsx`'s exact
 * mocking pattern. `MovementsPage` is an `async` Server Component —
 * approach (ii) from `design.md`/`tasks.md` group (d): `await` the invoked
 * async page function to get its returned element, then render that
 * element with RTL. Text/label/role assertions only, zero className
 * assertions.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({}) }));

const getCurrentHouseholdId = vi.fn();
vi.mock("@/modules/core/api", () => ({
  getCurrentHouseholdId: (...args: unknown[]) => getCurrentHouseholdId(...args),
}));

const listActiveAccounts = vi.fn();
const listActiveCategories = vi.fn();
const listRecentTransactions = vi.fn();
const listBudgetsWithProgress = vi.fn();
vi.mock("@/modules/finance/api", () => ({
  listActiveAccounts: (...args: unknown[]) => listActiveAccounts(...args),
  listActiveCategories: (...args: unknown[]) => listActiveCategories(...args),
  listRecentTransactions: (...args: unknown[]) => listRecentTransactions(...args),
  listBudgetsWithProgress: (...args: unknown[]) => listBudgetsWithProgress(...args),
  recordTransaction: vi.fn(),
  recordTransfer: vi.fn(),
  updateTransaction: vi.fn(),
  voidTransactionById: vi.fn(),
}));

const { default: MovementsPage } = await import("@/app/(app)/movimientos/page");

describe("MovementsPage — smoke render (finance-ui-polish P-021)", () => {
  afterEach(() => {
    cleanup();
    getCurrentHouseholdId.mockReset();
    listActiveAccounts.mockReset();
    listActiveCategories.mockReset();
    listRecentTransactions.mockReset();
    listBudgetsWithProgress.mockReset();
  });

  it("renders recent transactions via TransactionRow when populated", async () => {
    getCurrentHouseholdId.mockResolvedValue("space-1");
    listActiveAccounts.mockResolvedValue([{ id: "acc-1", name: "Nómina BBVA" }]);
    listActiveCategories.mockResolvedValue([{ id: "cat-1", name: "Comida", kind: "expense" }]);
    listBudgetsWithProgress.mockResolvedValue([]);
    listRecentTransactions.mockResolvedValue([
      {
        id: "tx-1",
        accountId: "acc-1",
        accountName: "Nómina BBVA",
        categoryId: "cat-1",
        categoryName: "Comida",
        type: "expense",
        amountCents: -15000,
        occurredOn: "2026-08-05",
        description: "",
        status: "posted",
        transferGroupId: null,
      },
    ]);

    const element = await MovementsPage();
    render(element);

    expect(screen.getByText("Movimientos")).toBeInTheDocument();
    // Appears once in the form's account <select> and once in the recent-list row.
    expect(screen.getAllByText("Nómina BBVA").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Gasto · Comida · 2026-08-05")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute("href", "/movimientos/tx-1/editar");
  });

  it("renders the EmptyState when there are zero movements", async () => {
    getCurrentHouseholdId.mockResolvedValue("space-1");
    listActiveAccounts.mockResolvedValue([]);
    listActiveCategories.mockResolvedValue([]);
    listBudgetsWithProgress.mockResolvedValue([]);
    listRecentTransactions.mockResolvedValue([]);

    const element = await MovementsPage();
    render(element);

    expect(screen.getByText("Aún no hay movimientos")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Registrar movimiento" })).toBeInTheDocument();
  });
});
