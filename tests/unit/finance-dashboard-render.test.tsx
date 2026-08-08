import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RTL smoke-render for the Finance dashboard screen at `/finance` (finance-ui-polish P-019,
 * extended by change: finance-dashboard-feed F-013; relocated by change: app-module-hub —
 * `/` now renders the neutral module hub, and this dashboard moved to `/finance`, see
 * `tests/unit/hub-page-render.test.tsx` for the hub's own coverage), mirroring
 * `tests/unit/account-form-render.test.tsx`'s exact mocking pattern. `HomePage` is an `async`
 * Server Component — approach (ii) from `design.md`/`tasks.md` group (d): `await` the invoked
 * async page function to get its returned element, then render that element with RTL. Mocks
 * `server-only`, `next/cache`, `next/navigation`, `@/shared/supabase/server`, plus the two
 * module `api/` barrels the page reads through (`@/modules/core/api`, `@/modules/finance/api`)
 * so no real Supabase call happens. Text/label/role assertions only, zero className assertions.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({}) }));

const getCurrentProfile = vi.fn();
const getCurrentHouseholdId = vi.fn();
vi.mock("@/modules/core/api", () => ({
  getCurrentProfile: (...args: unknown[]) => getCurrentProfile(...args),
  getCurrentHouseholdId: (...args: unknown[]) => getCurrentHouseholdId(...args),
}));

const getHouseholdSummary = vi.fn();
const listActiveAccounts = vi.fn();
const countDueRecurring = vi.fn();
const getMonthSummary = vi.fn();
const listCategorySpend = vi.fn();
const listRecentTransactions = vi.fn();
const listCreditCardStatus = vi.fn();
vi.mock("@/modules/finance/api", () => ({
  getHouseholdSummary: (...args: unknown[]) => getHouseholdSummary(...args),
  listActiveAccounts: (...args: unknown[]) => listActiveAccounts(...args),
  countDueRecurring: (...args: unknown[]) => countDueRecurring(...args),
  getMonthSummary: (...args: unknown[]) => getMonthSummary(...args),
  listCategorySpend: (...args: unknown[]) => listCategorySpend(...args),
  listRecentTransactions: (...args: unknown[]) => listRecentTransactions(...args),
  listCreditCardStatus: (...args: unknown[]) => listCreditCardStatus(...args),
}));

const { default: HomePage } = await import("@/app/(app)/(finance)/finance/page");

function resetAllMocks() {
  cleanup();
  getCurrentProfile.mockReset();
  getCurrentHouseholdId.mockReset();
  getHouseholdSummary.mockReset();
  listActiveAccounts.mockReset();
  countDueRecurring.mockReset();
  getMonthSummary.mockReset();
  listCategorySpend.mockReset();
  listRecentTransactions.mockReset();
  listCreditCardStatus.mockReset();
  // Default: no credit cards, so the new "Por pagar pronto" card stays hidden unless a test
  // explicitly opts in (finance-credit-card-payments CC-024).
  listCreditCardStatus.mockResolvedValue([]);
}

describe("HomePage — smoke render (finance-ui-polish P-019, finance-dashboard-feed F-013)", () => {
  beforeEach(resetAllMocks);
  afterEach(resetAllMocks);

  it("renders the balance hero, quick actions, and accounts via TransactionRow when populated", async () => {
    getCurrentProfile.mockResolvedValue({ displayName: "Ana" });
    getCurrentHouseholdId.mockResolvedValue("space-1");
    getHouseholdSummary.mockResolvedValue({ availableCents: 500000, debtCents: 0 });
    listActiveAccounts.mockResolvedValue([
      { id: "acc-1", name: "Nómina BBVA", type: "checking", class: "asset", balanceCents: 500000 },
    ]);
    countDueRecurring.mockResolvedValue(0);
    getMonthSummary.mockResolvedValue({ incomeCents: 500000, expenseCents: 0 });
    listCategorySpend.mockResolvedValue([]);
    listRecentTransactions.mockResolvedValue([]);

    const element = await HomePage();
    render(element);

    expect(screen.getByText("Disponible")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nueva transacción" })).toHaveAttribute("href", "/movimientos");
    expect(screen.getByRole("link", { name: "Nueva cuenta" })).toHaveAttribute("href", "/cuentas/nueva");
    expect(screen.getByRole("link", { name: "Presupuestos" })).toHaveAttribute("href", "/presupuestos");
    expect(screen.getByText("Nómina BBVA")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it("renders the EmptyState when there are zero accounts", async () => {
    getCurrentProfile.mockResolvedValue({ displayName: "Ana" });
    getCurrentHouseholdId.mockResolvedValue("space-1");
    getHouseholdSummary.mockResolvedValue({ availableCents: 0, debtCents: 0 });
    listActiveAccounts.mockResolvedValue([]);
    countDueRecurring.mockResolvedValue(0);
    getMonthSummary.mockResolvedValue({ incomeCents: 0, expenseCents: 0 });
    listCategorySpend.mockResolvedValue([]);
    listRecentTransactions.mockResolvedValue([]);

    const element = await HomePage();
    render(element);

    expect(screen.getByText("Empieza por tu primera cuenta")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Nueva cuenta" }).length).toBeGreaterThan(0);
  });

  it("does not render the due-recurring banner when the count is 0", async () => {
    getCurrentProfile.mockResolvedValue({ displayName: "Ana" });
    getCurrentHouseholdId.mockResolvedValue("space-1");
    getHouseholdSummary.mockResolvedValue({ availableCents: 0, debtCents: 0 });
    listActiveAccounts.mockResolvedValue([]);
    countDueRecurring.mockResolvedValue(0);
    getMonthSummary.mockResolvedValue({ incomeCents: 0, expenseCents: 0 });
    listCategorySpend.mockResolvedValue([]);
    listRecentTransactions.mockResolvedValue([]);

    const element = await HomePage();
    render(element);

    expect(screen.queryByText(/por confirmar/)).not.toBeInTheDocument();
  });

  it("renders the due-recurring banner with the count and a link to /recurrentes when items are due", async () => {
    getCurrentProfile.mockResolvedValue({ displayName: "Ana" });
    getCurrentHouseholdId.mockResolvedValue("space-1");
    getHouseholdSummary.mockResolvedValue({ availableCents: 0, debtCents: 0 });
    listActiveAccounts.mockResolvedValue([]);
    countDueRecurring.mockResolvedValue(3);
    getMonthSummary.mockResolvedValue({ incomeCents: 0, expenseCents: 0 });
    listCategorySpend.mockResolvedValue([]);
    listRecentTransactions.mockResolvedValue([]);

    const element = await HomePage();
    render(element);

    expect(screen.getByText("3 recurrentes por confirmar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /recurrentes por confirmar/ })).toHaveAttribute("href", "/recurrentes");
  });

  it("renders the three new cards in design.md §6 order, between the debt card and the accounts card, and moves accounts below them (DOM order)", async () => {
    getCurrentProfile.mockResolvedValue({ displayName: "Ana" });
    getCurrentHouseholdId.mockResolvedValue("space-1");
    getHouseholdSummary.mockResolvedValue({ availableCents: 500000, debtCents: 20000 });
    listActiveAccounts.mockResolvedValue([
      { id: "acc-1", name: "Nómina BBVA", type: "checking", class: "asset", balanceCents: 500000 },
    ]);
    countDueRecurring.mockResolvedValue(0);
    getMonthSummary.mockResolvedValue({ incomeCents: 800000, expenseCents: 300000 });
    listCategorySpend.mockResolvedValue([
      { categoryId: "cat-1", categoryName: "Comida", spentCents: 200000 },
      { categoryId: "cat-2", categoryName: "Transporte", spentCents: 100000 },
    ]);
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
        description: "Super",
        status: "posted",
        transferGroupId: null,
      },
      {
        id: "tx-2",
        accountId: "acc-1",
        accountName: "Nómina BBVA",
        categoryId: "cat-1",
        categoryName: "Sueldo",
        type: "income",
        amountCents: 800000,
        occurredOn: "2026-08-01",
        description: "Pago",
        status: "posted",
        transferGroupId: null,
      },
      {
        id: "tx-3",
        accountId: "acc-1",
        accountName: "Nómina BBVA",
        categoryId: null,
        categoryName: null,
        type: "expense",
        amountCents: -10000,
        occurredOn: "2026-07-30",
        description: "Renta",
        status: "posted",
        transferGroupId: null,
      },
      {
        id: "tx-4",
        accountId: "acc-1",
        accountName: "Nómina BBVA",
        categoryId: null,
        categoryName: null,
        type: "expense",
        amountCents: -5000,
        occurredOn: "2026-07-29",
        description: "Café",
        status: "posted",
        transferGroupId: null,
      },
    ]);

    const element = await HomePage();
    const { container } = render(element);

    const debtHeading = screen.getByText("Deuda");
    const monthLabelHeading = screen.getByText(/2026$/);
    const categoryHeading = screen.getByText("Gastos por categoría");
    const recentHeading = screen.getByText("Movimientos recientes");
    const accountsHeading = screen.getByText("Tus cuentas");

    // DOM order via compareDocumentPosition — every node listed must appear strictly after
    // the previous one (bit 4 = Node.DOCUMENT_POSITION_FOLLOWING).
    const nodesInExpectedOrder = [debtHeading, monthLabelHeading, categoryHeading, recentHeading, accountsHeading];
    for (let i = 0; i < nodesInExpectedOrder.length - 1; i++) {
      const position = nodesInExpectedOrder[i].compareDocumentPosition(nodesInExpectedOrder[i + 1]);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    // Exactly 4 rows in the recent-movements preview, with a link to /movimientos.
    expect(screen.getByText("Super")).toBeInTheDocument();
    expect(screen.getByText("Pago")).toBeInTheDocument();
    expect(screen.getByText("Renta")).toBeInTheDocument();
    expect(screen.getByText("Café")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver todos" })).toHaveAttribute("href", "/movimientos");

    expect(container.textContent).not.toContain("NaN");
    expect(container.textContent).not.toMatch(/(?<!\d)0%(?!\d)/);
  });

  it("renders EmptyState for all three new cards when the month has zero transactions, with no NaN/orphan 0%", async () => {
    getCurrentProfile.mockResolvedValue({ displayName: "Ana" });
    getCurrentHouseholdId.mockResolvedValue("space-1");
    getHouseholdSummary.mockResolvedValue({ availableCents: 0, debtCents: 0 });
    listActiveAccounts.mockResolvedValue([]);
    countDueRecurring.mockResolvedValue(0);
    getMonthSummary.mockResolvedValue({ incomeCents: 0, expenseCents: 0 });
    listCategorySpend.mockResolvedValue([]);
    listRecentTransactions.mockResolvedValue([]);

    const element = await HomePage();
    const { container } = render(element);

    expect(screen.getByText("Aún no hay movimientos este mes")).toBeInTheDocument();
    expect(screen.getByText("Sin gastos por categoría")).toBeInTheDocument();
    expect(screen.getByText("Sin movimientos recientes")).toBeInTheDocument();

    expect(container.textContent).not.toContain("NaN");
    expect(container.textContent).not.toMatch(/(?<!\d)0%(?!\d)/);
  });

  it("renders real summary totals AND the category-spend EmptyState for an income-only month (partial-month, independent per card)", async () => {
    getCurrentProfile.mockResolvedValue({ displayName: "Ana" });
    getCurrentHouseholdId.mockResolvedValue("space-1");
    getHouseholdSummary.mockResolvedValue({ availableCents: 0, debtCents: 0 });
    listActiveAccounts.mockResolvedValue([]);
    countDueRecurring.mockResolvedValue(0);
    getMonthSummary.mockResolvedValue({ incomeCents: 800000, expenseCents: 0 });
    listCategorySpend.mockResolvedValue([]);
    listRecentTransactions.mockResolvedValue([]);

    const element = await HomePage();
    render(element);

    expect(screen.queryByText("Aún no hay movimientos este mes")).not.toBeInTheDocument();
    expect(screen.getByText("Ingresos")).toBeInTheDocument();
    expect(screen.getByText("Sin gastos por categoría")).toBeInTheDocument();
  });

  it("shows a transfer as a preview row while summary totals are unchanged by it", async () => {
    getCurrentProfile.mockResolvedValue({ displayName: "Ana" });
    getCurrentHouseholdId.mockResolvedValue("space-1");
    getHouseholdSummary.mockResolvedValue({ availableCents: 0, debtCents: 0 });
    listActiveAccounts.mockResolvedValue([]);
    countDueRecurring.mockResolvedValue(0);
    getMonthSummary.mockResolvedValue({ incomeCents: 500000, expenseCents: 100000 });
    listCategorySpend.mockResolvedValue([{ categoryId: "cat-1", categoryName: "Comida", spentCents: 100000 }]);
    listRecentTransactions.mockResolvedValue([
      {
        id: "tx-transfer",
        accountId: "acc-1",
        accountName: "Nómina BBVA",
        categoryId: null,
        categoryName: null,
        type: "transfer",
        amountCents: -50000,
        occurredOn: "2026-08-05",
        description: "A ahorros",
        status: "posted",
        transferGroupId: "grp-1",
      },
    ]);

    const element = await HomePage();
    render(element);

    expect(screen.getByText("A ahorros")).toBeInTheDocument();
    expect(screen.getByText(/Transferencia/)).toBeInTheDocument();
    // Totals are unaffected by the transfer row — they reflect only the mocked view read.
    expect(screen.getByText("Ingresos")).toBeInTheDocument();
  });
});
