import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TransactionRow } from "@/design-system/patterns/TransactionRow";

describe("TransactionRow", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders title, subtitle, and formatted amount", () => {
    render(
      <TransactionRow
        title="Cuenta de cheques"
        subtitle="Gasto · 2026-08-05"
        formattedAmount="-$150.00"
        kind="expense"
      />,
    );
    expect(screen.getByText("Cuenta de cheques")).toBeInTheDocument();
    expect(screen.getByText("Gasto · 2026-08-05")).toBeInTheDocument();
    expect(screen.getByText("-$150.00")).toBeInTheDocument();
  });

  it("renders the trailing slot", () => {
    render(
      <TransactionRow
        title="Nómina"
        formattedAmount="$1,000.00"
        kind="income"
        trailing={<a href="/movimientos/1/editar">Editar</a>}
      />,
    );
    expect(screen.getByRole("link", { name: "Editar" })).toBeInTheDocument();
  });

  it("reduces opacity when muted", () => {
    render(<TransactionRow title="Anulado" formattedAmount="$0.00" kind="expense" muted />);
    expect(screen.getByText("Anulado").closest("div.opacity-50")).toBeInTheDocument();
  });

  it("falls back to the title initial when no icon is provided", () => {
    render(<TransactionRow title="Ahorros" formattedAmount="$0.00" kind="income" />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
