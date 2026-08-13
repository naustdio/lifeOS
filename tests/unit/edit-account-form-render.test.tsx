import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// change: finance-account-edit T4.6-T4.10 — RTL scenario tests for `EditAccountForm.tsx`.
// Mirrors `tests/unit/account-form-render.test.tsx`'s established pattern: mock the
// `"use server"` actions module (never invoked in these render-level tests) so import never
// reaches `next/cache`/`next/navigation`/`@/shared/supabase/server`.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const updateAccountActionSpy = vi.fn(async () => ({ error: null }));
const setAccountArchivedActionSpy = vi.fn(async () => ({ error: null }));
const deleteAccountActionSpy = vi.fn(async () => ({ error: null }));

vi.mock("@/app/(app)/(finance)/cuentas/actions", () => ({
  updateAccountAction: updateAccountActionSpy,
  setAccountArchivedAction: setAccountArchivedActionSpy,
  deleteAccountAction: deleteAccountActionSpy,
}));

const { EditAccountForm } = await import("@/app/(app)/(finance)/cuentas/[id]/editar/EditAccountForm");

const baseAccount = {
  id: "acc-1",
  name: "Efectivo",
  type: "cash" as const,
  class: "asset" as const,
  balanceCents: 500000,
  archivedAt: null,
};

describe("EditAccountForm — rename round-trip (T4.6)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the current name/type prefilled and submits without a confirmation panel for a plain rename", () => {
    render(<EditAccountForm account={baseAccount} />);
    const nameInput = screen.getByLabelText("Nombre") as HTMLInputElement;
    expect(nameInput.value).toBe("Efectivo");
    fireEvent.change(nameInput, { target: { value: "Cartera" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    // No type change -> no confirmation panel should appear.
    expect(screen.queryByText("Confirmar cambio de tipo")).not.toBeInTheDocument();
  });
});

describe("EditAccountForm — credit-card terms prefill (CRITICAL-1 fix, sdd-verify finance-account-edit)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("prefills the card-terms fieldset with the account's REAL saved values, not blanks", () => {
    const creditCardAccount = {
      ...baseAccount,
      type: "credit_card" as const,
      card: { creditLimitCents: 500000, statementDay: 5, dueDay: 20, minPaymentCents: 20000 },
    };
    render(<EditAccountForm account={creditCardAccount} />);

    expect((screen.getByLabelText("Límite de crédito (MXN)") as HTMLInputElement).value).toBe("5000");
    expect((screen.getByLabelText("Pago mínimo (MXN)") as HTMLInputElement).value).toBe("200");
    expect(screen.getByLabelText("Día de corte")).toHaveTextContent("5");
    expect(screen.getByLabelText("Día de pago")).toHaveTextContent("20");
  });
});

describe("EditAccountForm — retype with/without detail loss (T4.7)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the live inline detail-loss warning as the type Select changes, listing exact discarded fields", () => {
    const liabilityAccount = {
      ...baseAccount,
      type: "liability" as const,
      class: "liability" as const,
      liability: { interestRateBp: 500, termMonths: 12, monthlyPaymentCents: 9000, startDate: "2026-01-01" },
    };
    render(<EditAccountForm account={liabilityAccount} />);

    fireEvent.click(screen.getByLabelText("Tipo de cuenta"));
    fireEvent.click(screen.getByRole("option", { name: "Efectivo" }));

    expect(screen.getByText(/Al cambiar el tipo se van a borrar/)).toBeInTheDocument();
    expect(screen.getByText(/Tasa de interés/)).toBeInTheDocument();
    expect(screen.getByText(/Pago mensual/)).toBeInTheDocument();
  });

  it("shows no detail-loss warning for a transition with no detail fields on either side", () => {
    render(<EditAccountForm account={baseAccount} />);
    fireEvent.click(screen.getByLabelText("Tipo de cuenta"));
    fireEvent.click(screen.getByRole("option", { name: "Tarjeta de débito" }));
    expect(screen.queryByText(/Al cambiar el tipo se van a borrar/)).not.toBeInTheDocument();
  });

  it("requires the new type's detail fields before the confirmation panel appears (savings_goal)", () => {
    render(<EditAccountForm account={baseAccount} />);
    fireEvent.click(screen.getByLabelText("Tipo de cuenta"));
    fireEvent.click(screen.getByRole("option", { name: "Meta de ahorro" }));
    expect(screen.getByLabelText("Monto objetivo (MXN)")).toBeRequired();
  });
});

describe("EditAccountForm — class-flip confirmation (T4.8)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the confirmation panel naming the amount moving disponible->deuda on an asset->liability flip", () => {
    render(<EditAccountForm account={baseAccount} />);

    fireEvent.click(screen.getByLabelText("Tipo de cuenta"));
    fireEvent.click(screen.getByRole("option", { name: "Préstamo / deuda" }));

    // Fill required liability fields so the form can be submitted.
    fireEvent.change(screen.getByLabelText("Monto original (MXN)"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Tasa de interés (puntos base)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Plazo (meses)"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Pago mensual (MXN)"), { target: { value: "90" } });

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("Confirmar cambio de tipo")).toBeInTheDocument();
    expect(screen.getByText(/Esto mueve dinero entre disponible y deuda/)).toBeInTheDocument();
    expect(screen.getByText(/se van a mover de tu disponible a tu deuda/i)).toBeInTheDocument();
    expect(screen.getByText(/\$5,000\.00/)).toBeInTheDocument();
    // `cash` carries no detail fields, so this transition shows ONLY the class-flip block.
    expect(screen.queryByText("Se van a borrar estos datos:")).not.toBeInTheDocument();
  });

  it("combines BOTH the detail-loss and class-flip blocks in ONE panel when a retype triggers both (liability -> savings)", () => {
    const liabilityAccount = {
      ...baseAccount,
      type: "liability" as const,
      class: "liability" as const,
      liability: { interestRateBp: 500, termMonths: 12, monthlyPaymentCents: 9000, startDate: "2026-01-01" },
    };
    render(<EditAccountForm account={liabilityAccount} />);

    fireEvent.click(screen.getByLabelText("Tipo de cuenta"));
    fireEvent.click(screen.getByRole("option", { name: "Ahorros" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("Confirmar cambio de tipo")).toBeInTheDocument();
    expect(screen.getByText("Se van a borrar estos datos:")).toBeInTheDocument();
    expect(screen.getByText(/Esto mueve dinero entre disponible y deuda/)).toBeInTheDocument();
    // Single "Confirmar" button — not two stacked dialogs.
    expect(screen.getAllByRole("button", { name: "Confirmar" })).toHaveLength(1);
  });

  it("shows no class-flip confirmation for a non-flipping retype (cash -> checking)", () => {
    render(<EditAccountForm account={baseAccount} />);
    fireEvent.click(screen.getByLabelText("Tipo de cuenta"));
    fireEvent.click(screen.getByRole("option", { name: "Tarjeta de débito" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.queryByText("Confirmar cambio de tipo")).not.toBeInTheDocument();
  });
});

describe("EditAccountForm — delete (T4.9)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps the delete button disabled until the exact account name is typed", () => {
    render(<EditAccountForm account={baseAccount} />);
    const deleteButton = screen.getByRole("button", { name: /Eliminar cuenta/ });
    expect(deleteButton).toBeDisabled();

    const confirmInput = screen.getByLabelText(/Escribe/);
    fireEvent.change(confirmInput, { target: { value: "wrong name" } });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(confirmInput, { target: { value: "Efectivo" } });
    expect(deleteButton).not.toBeDisabled();
  });
});

describe("EditAccountForm — pause/reactivate (T4.4)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a Pausar cuenta button for an active account and a Reactivar cuenta button for a paused one", () => {
    render(<EditAccountForm account={baseAccount} />);
    expect(screen.getByRole("button", { name: "Pausar cuenta" })).toBeInTheDocument();
    cleanup();

    render(<EditAccountForm account={{ ...baseAccount, archivedAt: "2026-01-01T00:00:00Z" }} />);
    expect(screen.getByRole("button", { name: "Reactivar cuenta" })).toBeInTheDocument();
    expect(screen.getByText(/Esta cuenta está pausada/)).toBeInTheDocument();
  });

  it("calls window.confirm before pausing (reversible confirmation, not window.confirm-free)", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<EditAccountForm account={baseAccount} />);
    fireEvent.click(screen.getByRole("button", { name: "Pausar cuenta" }));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe("EditAccountForm — no confirmation, no fire (T4.10)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("does not call the delete action when the confirm button is disabled and the form submit is attempted directly", () => {
    render(<EditAccountForm account={baseAccount} />);
    const form = screen.getByRole("button", { name: /Eliminar cuenta/ }).closest("form")!;
    fireEvent.submit(form);
    expect(deleteAccountActionSpy).not.toHaveBeenCalled();
  });

  it("does not call the archive action when window.confirm is canceled", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<EditAccountForm account={baseAccount} />);
    fireEvent.click(screen.getByRole("button", { name: "Pausar cuenta" }));
    expect(setAccountArchivedActionSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("does not call the update action directly when a type change requires confirmation and the user has not confirmed", () => {
    render(<EditAccountForm account={baseAccount} />);
    fireEvent.click(screen.getByLabelText("Tipo de cuenta"));
    fireEvent.click(screen.getByRole("option", { name: "Préstamo / deuda" }));
    fireEvent.change(screen.getByLabelText("Monto original (MXN)"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Tasa de interés (puntos base)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Plazo (meses)"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Pago mensual (MXN)"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    // The confirmation panel is shown instead of firing the action.
    expect(screen.getByText("Confirmar cambio de tipo")).toBeInTheDocument();
    expect(updateAccountActionSpy).not.toHaveBeenCalled();
  });
});
