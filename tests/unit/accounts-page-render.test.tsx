import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RTL smoke-render for the Cuentas screen (finance-ui-polish P-020), mirroring
 * `tests/unit/account-form-render.test.tsx`'s exact mocking pattern.
 * `AccountsPage` is an `async` Server Component — approach (ii) from
 * `design.md`/`tasks.md` group (d): `await` the invoked async page function
 * to get its returned element, then render that element with RTL. Text/
 * label/role assertions only, zero className assertions.
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
const listCreditCardStatus = vi.fn();
const getHouseholdSummary = vi.fn();
vi.mock("@/modules/finance/api", () => ({
  listActiveAccounts: (...args: unknown[]) => listActiveAccounts(...args),
  listCreditCardStatus: (...args: unknown[]) => listCreditCardStatus(...args),
  getHouseholdSummary: (...args: unknown[]) => getHouseholdSummary(...args),
}));

const { default: AccountsPage } = await import("@/app/(app)/cuentas/page");

describe("AccountsPage — smoke render (finance-ui-polish P-020)", () => {
  beforeEach(() => {
    listCreditCardStatus.mockResolvedValue([]);
    getHouseholdSummary.mockResolvedValue({ availableCents: 0, debtCents: 0 });
  });

  afterEach(() => {
    cleanup();
    getCurrentHouseholdId.mockReset();
    listActiveAccounts.mockReset();
    listCreditCardStatus.mockReset();
    getHouseholdSummary.mockReset();
  });

  it("renders accounts via TransactionRow and a goal's ProgressBar when populated", async () => {
    getCurrentHouseholdId.mockResolvedValue("space-1");
    listActiveAccounts.mockResolvedValue([
      { id: "acc-1", name: "Nómina BBVA", type: "checking", class: "asset", balanceCents: 500000 },
      {
        id: "acc-2",
        name: "Meta viaje",
        type: "savings_goal",
        class: "asset",
        balanceCents: 150000,
        goal: { targetAmountCents: 300000, targetDate: null },
      },
    ]);

    const element = await AccountsPage();
    render(element);

    expect(screen.getByText("Cuentas")).toBeInTheDocument();
    expect(screen.getByText("Nómina BBVA")).toBeInTheDocument();
    expect(screen.getByText("Meta viaje")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "50");
  });

  it("renders the EmptyState when there are zero accounts", async () => {
    getCurrentHouseholdId.mockResolvedValue("space-1");
    listActiveAccounts.mockResolvedValue([]);

    const element = await AccountsPage();
    render(element);

    expect(screen.getByText("Todavía no tienes cuentas")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Nueva cuenta" }).length).toBeGreaterThan(0);
  });

  // finance-credit-card-payments CC-023: due-date copy + used/limit bar + over-limit warning
  // chip for a card WITH terms; the empty-state link for a card with none, never NaN.
  it("shows due-date copy, a used/limit bar, and an over-limit chip for a card with terms", async () => {
    getCurrentHouseholdId.mockResolvedValue("space-1");
    listActiveAccounts.mockResolvedValue([
      { id: "acc-3", name: "Tarjeta Oro", type: "credit_card", class: "liability", balanceCents: -120000 },
    ]);
    listCreditCardStatus.mockResolvedValue([
      {
        accountId: "acc-3",
        householdId: "space-1",
        name: "Tarjeta Oro",
        balanceCents: -120000,
        owedCents: 120000,
        creditLimitCents: 100000,
        statementDay: 20,
        dueDay: 5,
        minPaymentCents: 5000,
        nextDueDate: "2026-08-12",
        daysUntilDue: 5,
        utilizationBp: 12000,
        overLimit: true,
        hasTerms: true,
      },
    ]);

    const element = await AccountsPage();
    render(element);

    expect(screen.getByText("Vence en 5 días")).toBeInTheDocument();
    expect(screen.getByText("Límite excedido")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows the empty-state link (never NaN) for a card with no terms", async () => {
    getCurrentHouseholdId.mockResolvedValue("space-1");
    listActiveAccounts.mockResolvedValue([
      { id: "acc-4", name: "Tarjeta Plata", type: "credit_card", class: "liability", balanceCents: 0 },
    ]);
    listCreditCardStatus.mockResolvedValue([
      {
        accountId: "acc-4",
        householdId: "space-1",
        name: "Tarjeta Plata",
        balanceCents: 0,
        owedCents: 0,
        creditLimitCents: null,
        statementDay: null,
        dueDay: null,
        minPaymentCents: null,
        nextDueDate: null,
        daysUntilDue: null,
        utilizationBp: null,
        overLimit: false,
        hasTerms: false,
      },
    ]);

    const element = await AccountsPage();
    render(element);

    expect(screen.getByText("Sin términos configurados · Agregar")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
