import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Closes verify-report-2c Issue C-1 for `AccountForm` (T-036): an RTL
 * smoke-render proving the component actually mounts through React (never
 * proven before — `next build` only compiles/type-checks this dynamic
 * route, it never executes the render). Also exercises the component's one
 * real branch of logic: which conditional fieldset (liability vs.
 * savings_goal) appears per selected account `type`.
 *
 * `./actions` is a `"use server"` module that reaches `next/cache`,
 * `next/navigation`, and `@/shared/supabase/server` at import time (via
 * `createAccountAction`'s body) — mocked the same way
 * `tests/integration/account-creation-ui.test.ts` mocks them, even though
 * this test never submits the form, to avoid any real server/module
 * resolution surprises during import.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const { AccountForm } = await import("@/app/(app)/(finance)/cuentas/AccountForm");

describe("AccountForm — smoke render (T-036 / C-1)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders without throwing for the default (cash) type", () => {
    render(<AccountForm />);
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de cuenta")).toBeInTheDocument();
    // Neither conditional fieldset is present for a plain asset type.
    expect(screen.queryByText("Datos del préstamo")).not.toBeInTheDocument();
    expect(screen.queryByText("Meta de ahorro", { selector: "legend" })).not.toBeInTheDocument();
  });

  it("shows the liability fieldset (and hides the goal fieldset) when type=liability", () => {
    render(<AccountForm />);

    fireEvent.click(screen.getByLabelText("Tipo de cuenta"));
    fireEvent.click(screen.getByRole("option", { name: "Préstamo / deuda" }));

    expect(screen.getByText("Datos del préstamo")).toBeInTheDocument();
    expect(screen.getByLabelText("Monto original (MXN)")).toBeInTheDocument();
    expect(screen.getByLabelText("Tasa de interés (puntos base)")).toBeInTheDocument();
    expect(screen.getByLabelText("Plazo (meses)")).toBeInTheDocument();
    expect(screen.getByLabelText("Pago mensual (MXN)")).toBeInTheDocument();
    expect(screen.queryByText("Meta de ahorro", { selector: "legend" })).not.toBeInTheDocument();
  });

  it("shows the savings_goal fieldset (and hides the liability fieldset) when type=savings_goal", () => {
    render(<AccountForm />);

    fireEvent.click(screen.getByLabelText("Tipo de cuenta"));
    fireEvent.click(screen.getByRole("option", { name: "Meta de ahorro" }));

    expect(screen.getByText("Meta de ahorro", { selector: "legend" })).toBeInTheDocument();
    expect(screen.getByLabelText("Monto objetivo (MXN)")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha objetivo (opcional)")).toBeInTheDocument();
    expect(screen.queryByText("Datos del préstamo")).not.toBeInTheDocument();
  });

  it("shows the investment fieldset (and hides the others) when type=investment", () => {
    render(<AccountForm />);

    fireEvent.click(screen.getByLabelText("Tipo de cuenta"));
    fireEvent.click(screen.getByRole("option", { name: "Inversiones" }));

    expect(screen.getByText("Inversión", { selector: "legend" })).toBeInTheDocument();
    expect(screen.getByLabelText("Costo base (MXN)")).toBeInTheDocument();
    expect(screen.getByLabelText("Valor actual (MXN, opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha de valuación (opcional)")).toBeInTheDocument();
    expect(
      screen.getByText(/la app no consulta precios de mercado/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Datos del préstamo")).not.toBeInTheDocument();
    expect(screen.queryByText("Meta de ahorro", { selector: "legend" })).not.toBeInTheDocument();
  });

  it("shows the loaned fieldset with an inverted sign hint when type=loaned", () => {
    render(<AccountForm />);

    fireEvent.click(screen.getByLabelText("Tipo de cuenta"));
    fireEvent.click(screen.getByRole("option", { name: "Prestado" }));

    expect(screen.getByText("Datos del préstamo", { selector: "legend" })).toBeInTheDocument();
    expect(screen.getByLabelText("¿Quién te debe?")).toBeInTheDocument();
    expect(screen.getByLabelText("Monto original (MXN)")).toBeInTheDocument();
    expect(screen.getByLabelText("Plazo (meses, opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha de retorno esperada (opcional)")).toBeInTheDocument();
    expect(
      screen.getByText("Para dinero prestado, el saldo inicial debe ser cero o positivo."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Saldo inicial (MXN)")).toHaveAttribute("min", "0");
    expect(screen.queryByText("Inversión", { selector: "legend" })).not.toBeInTheDocument();
    expect(screen.queryByText("Meta de ahorro", { selector: "legend" })).not.toBeInTheDocument();
  });

  // finance-credit-card-payments CC-025/CC-022: the card-terms fieldset only appears for
  // type=credit_card, every field is optional (no `required`), and the two day pickers are the
  // design-system Select — never a raw native <select>.
  it("shows the card-terms fieldset (all fields optional) only when type=credit_card", () => {
    render(<AccountForm />);

    fireEvent.click(screen.getByLabelText("Tipo de cuenta"));
    fireEvent.click(screen.getByRole("option", { name: "Tarjeta de crédito" }));

    expect(screen.getByText("Términos de la tarjeta (opcional)")).toBeInTheDocument();
    const limitInput = screen.getByLabelText("Límite de crédito (MXN)");
    const minPaymentInput = screen.getByLabelText("Pago mínimo (MXN)");
    expect(limitInput).not.toBeRequired();
    expect(minPaymentInput).not.toBeRequired();
    expect(screen.getByLabelText("Día de corte")).toBeInTheDocument();
    expect(screen.getByLabelText("Día de pago")).toBeInTheDocument();
    expect(screen.queryByText("Datos del préstamo")).not.toBeInTheDocument();
    expect(screen.queryByText("Meta de ahorro", { selector: "legend" })).not.toBeInTheDocument();
  });

  it("hides the card-terms fieldset for the default (cash) type", () => {
    render(<AccountForm />);
    expect(screen.queryByText("Términos de la tarjeta (opcional)")).not.toBeInTheDocument();
  });
});
