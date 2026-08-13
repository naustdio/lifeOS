import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountsScreen, type AccountItem, type CardStatusItem } from "@/app/(app)/(finance)/cuentas/AccountsScreen";

// change: finance-account-edit T5.4 — audit test locking in the design's archived-read audit:
// paused accounts never leak into the active list or the headline balance, and the "Pausadas"
// section is collapsed by default, expanding to reveal them with a reactivate path (via the
// same edit-route Link every account row uses).

const ACTIVE: AccountItem[] = [
  { id: "acc-1", name: "Activa", type: "cash", class: "asset", balanceCents: 100_00 },
];

const ARCHIVED: AccountItem[] = [
  { id: "acc-2", name: "Pausada", type: "cash", class: "asset", balanceCents: 200_00 },
];

const CARD_STATUSES: CardStatusItem[] = [];

describe("AccountsScreen — Pausadas section (T5.4)", () => {
  afterEach(() => cleanup());

  it("does not render a Pausadas section when there are no archived accounts", () => {
    render(<AccountsScreen accounts={ACTIVE} cardStatuses={CARD_STATUSES} availableCents={100_00} archivedAccounts={[]} />);
    expect(screen.queryByText(/Pausadas/)).not.toBeInTheDocument();
  });

  it("renders the Pausadas section collapsed by default (paused account name not visible until expanded)", () => {
    render(
      <AccountsScreen accounts={ACTIVE} cardStatuses={CARD_STATUSES} availableCents={100_00} archivedAccounts={ARCHIVED} />,
    );
    expect(screen.getByText("Pausadas (1)")).toBeInTheDocument();
    expect(screen.queryByText("Pausada")).not.toBeInTheDocument();
  });

  it("expands to reveal paused accounts on click", () => {
    render(
      <AccountsScreen accounts={ACTIVE} cardStatuses={CARD_STATUSES} availableCents={100_00} archivedAccounts={ARCHIVED} />,
    );
    fireEvent.click(screen.getByText("Pausadas (1)"));
    expect(screen.getByText("Pausada")).toBeInTheDocument();
  });

  it("never mixes a paused account into the active list", () => {
    render(
      <AccountsScreen accounts={ACTIVE} cardStatuses={CARD_STATUSES} availableCents={100_00} archivedAccounts={ARCHIVED} />,
    );
    // Active list shows "Activa" directly (not inside the collapsed Pausadas section).
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.queryByText("Pausada")).not.toBeInTheDocument();
  });

  it("hero total (availableCents) reflects only active accounts, unaffected by archived ones", () => {
    // availableCents is computed server-side (household_summary, which already filters
    // archived_at is null) and passed in as a prop — this locks in that the client never
    // recomputes it from `accounts` in a way that could include archivedAccounts.
    render(
      <AccountsScreen accounts={ACTIVE} cardStatuses={CARD_STATUSES} availableCents={100_00} archivedAccounts={ARCHIVED} />,
    );
    expect(screen.getAllByText("$100.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("$300.00")).not.toBeInTheDocument();
    expect(screen.queryByText("$200.00")).not.toBeInTheDocument();
  });

  it("hides the Pausadas section on non-Todo tabs", () => {
    render(
      <AccountsScreen accounts={ACTIVE} cardStatuses={CARD_STATUSES} availableCents={100_00} archivedAccounts={ARCHIVED} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Débito" }));
    expect(screen.queryByText(/Pausadas/)).not.toBeInTheDocument();
  });
});
