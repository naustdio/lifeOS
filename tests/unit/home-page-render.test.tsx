import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RTL smoke-render for the Home screen (finance-ui-polish P-019), mirroring
 * `tests/unit/account-form-render.test.tsx`'s exact mocking pattern.
 * `HomePage` is an `async` Server Component — approach (ii) from
 * `design.md`/`tasks.md` group (d): `await` the invoked async page function
 * to get its returned element, then render that element with RTL. Mocks
 * `server-only`, `next/cache`, `next/navigation`, `@/shared/supabase/server`,
 * plus the two module `api/` barrels the page reads through
 * (`@/modules/core/api`, `@/modules/finance/api`) so no real Supabase call
 * happens. Text/label/role assertions only, zero className assertions.
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
vi.mock("@/modules/finance/api", () => ({
  getHouseholdSummary: (...args: unknown[]) => getHouseholdSummary(...args),
  listActiveAccounts: (...args: unknown[]) => listActiveAccounts(...args),
}));

const { default: HomePage } = await import("@/app/(app)/page");

describe("HomePage — smoke render (finance-ui-polish P-019)", () => {
  afterEach(() => {
    cleanup();
    getCurrentProfile.mockReset();
    getCurrentHouseholdId.mockReset();
    getHouseholdSummary.mockReset();
    listActiveAccounts.mockReset();
  });

  it("renders the balance hero, quick actions, and accounts via TransactionRow when populated", async () => {
    getCurrentProfile.mockResolvedValue({ displayName: "Ana" });
    getCurrentHouseholdId.mockResolvedValue("space-1");
    getHouseholdSummary.mockResolvedValue({ availableCents: 500000, debtCents: 0 });
    listActiveAccounts.mockResolvedValue([
      { id: "acc-1", name: "Nómina BBVA", type: "checking", class: "asset", balanceCents: 500000 },
    ]);

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

    const element = await HomePage();
    render(element);

    expect(screen.getByText("Empieza por tu primera cuenta")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Nueva cuenta" }).length).toBeGreaterThan(0);
  });
});
