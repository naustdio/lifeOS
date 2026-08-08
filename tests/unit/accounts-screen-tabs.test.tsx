import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountsScreen, type AccountItem, type CardStatusItem } from "@/app/(app)/(finance)/cuentas/AccountsScreen";

/**
 * RTL smoke-render for `AccountsScreen`'s tabbed type filter (change: cuentas-tabbed-filter).
 * The "Todo" tab shows every account; selecting another tab narrows the list to that type group
 * and updates the hero figure to match.
 */

const ACCOUNTS: AccountItem[] = [
  { id: "acc-1", name: "Bolsillo", type: "cash", class: "asset", balanceCents: 100_00 },
  { id: "acc-2", name: "Vacaciones", type: "savings", class: "asset", balanceCents: 5_000_00 },
  { id: "acc-3", name: "Tarjeta Oro", type: "credit_card", class: "liability", balanceCents: -1_200_00 },
];

const CARD_STATUSES: CardStatusItem[] = [
  { accountId: "acc-3", hasTerms: true, owedCents: 1_200_00, creditLimitCents: 5_000_00, daysUntilDue: 5, overLimit: false },
];

describe("AccountsScreen — tabbed type filter", () => {
  afterEach(() => cleanup());

  it("the Todo tab shows every account", () => {
    render(<AccountsScreen accounts={ACCOUNTS} cardStatuses={CARD_STATUSES} availableCents={5_100_00} />);

    expect(screen.getByText("Bolsillo")).toBeInTheDocument();
    expect(screen.getByText("Vacaciones")).toBeInTheDocument();
    expect(screen.getByText("Tarjeta Oro")).toBeInTheDocument();
  });

  it("selecting Ahorros narrows the list to savings-type accounts only", () => {
    render(<AccountsScreen accounts={ACCOUNTS} cardStatuses={CARD_STATUSES} availableCents={5_100_00} />);

    fireEvent.click(screen.getByRole("tab", { name: "Ahorros" }));

    expect(screen.getByText("Vacaciones")).toBeInTheDocument();
    expect(screen.queryByText("Bolsillo")).not.toBeInTheDocument();
    expect(screen.queryByText("Tarjeta Oro")).not.toBeInTheDocument();
    // Hero + the single row both show the same figure since Ahorros has exactly one account.
    expect(screen.getAllByText("$5,000.00").length).toBeGreaterThanOrEqual(1);
  });

  it("selecting Tarjetas de crédito shows the owed total (debt magnitude), not the signed balance", () => {
    render(<AccountsScreen accounts={ACCOUNTS} cardStatuses={CARD_STATUSES} availableCents={5_100_00} />);

    fireEvent.click(screen.getByRole("tab", { name: "Tarjetas de crédito" }));

    expect(screen.getByText("Tarjeta Oro")).toBeInTheDocument();
    expect(screen.queryByText("Vacaciones")).not.toBeInTheDocument();
    expect(screen.getByText("$1,200.00")).toBeInTheDocument();
  });

  it("a tab with zero matching accounts shows the empty state, not a crash", () => {
    render(<AccountsScreen accounts={ACCOUNTS} cardStatuses={CARD_STATUSES} availableCents={5_100_00} />);

    fireEvent.click(screen.getByRole("tab", { name: "Prestado" }));

    expect(screen.getByText("Nada por aquí todavía")).toBeInTheDocument();
  });
});
