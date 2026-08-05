import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/modules/finance/api", () => ({
  listActiveAccounts: (...args: unknown[]) => listActiveAccounts(...args),
}));

const { default: AccountsPage } = await import("@/app/(app)/cuentas/page");

describe("AccountsPage — smoke render (finance-ui-polish P-020)", () => {
  afterEach(() => {
    cleanup();
    getCurrentHouseholdId.mockReset();
    listActiveAccounts.mockReset();
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
});
