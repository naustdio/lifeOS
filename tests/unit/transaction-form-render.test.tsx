import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Closes verify-report-2c Issue C-1 for `TransactionForm` (T-037): an RTL
 * smoke-render proving the component mounts through React and that its
 * expense/income/transfer tab branching renders the right fields — the
 * component's real piece of logic, never exercised before this test (the
 * existing integration test only calls the Server Actions directly with
 * hand-built `FormData`, it never mounts this component).
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const { TransactionForm } = await import("@/app/(app)/movimientos/TransactionForm");

const ACCOUNTS = [
  { id: "acc-1", name: "Cuenta A" },
  { id: "acc-2", name: "Cuenta B" },
];
const CATEGORIES = [
  { id: "cat-income-1", name: "Sueldo", kind: "income" as const },
  { id: "cat-expense-1", name: "Café", kind: "expense" as const },
];

describe("TransactionForm — smoke render (T-037 / C-1)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the expense tab by default with only expense categories", () => {
    render(<TransactionForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    expect(screen.getByLabelText("Cuenta")).toBeInTheDocument();
    expect(screen.getByLabelText("Categoría")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Café" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Sueldo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar gasto" })).toBeInTheDocument();
    // Transfer-only fields are not present.
    expect(screen.queryByLabelText("Desde")).not.toBeInTheDocument();
  });

  it("switches to the income tab and shows only income categories", () => {
    render(<TransactionForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    fireEvent.click(screen.getByRole("button", { name: "Ingreso" }));

    expect(screen.getByRole("option", { name: "Sueldo" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Café" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar ingreso" })).toBeInTheDocument();
  });

  it("switches to the transfer tab and shows Desde/Hacia account fields instead of category/amount-form fields", () => {
    render(<TransactionForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    fireEvent.click(screen.getByRole("button", { name: "Transferencia" }));

    expect(screen.getByLabelText("Desde")).toBeInTheDocument();
    expect(screen.getByLabelText("Hacia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar transferencia" })).toBeInTheDocument();
    // Income/expense-only fields are gone.
    expect(screen.queryByLabelText("Categoría")).not.toBeInTheDocument();
  });
});
