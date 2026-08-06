import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RTL smoke-render for `RecurringForm` (design.md §11, change: finance-recurring R-022):
 * the frequency picker is the design-system `Select` (Radix, no raw `<select>` in the tree) —
 * the standing `finance-ui-polish` convention.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const saveRecurringAction = vi.fn();
vi.mock("@/app/(app)/recurrentes/actions", () => ({ saveRecurringAction }));

const { RecurringForm } = await import("@/app/(app)/recurrentes/RecurringForm");

const ACCOUNTS = [{ id: "acc-1", name: "Efectivo" }];
const CATEGORIES = [{ id: "cat-1", name: "Renta" }];

describe("RecurringForm — smoke render (R-022)", () => {
  afterEach(() => {
    cleanup();
    saveRecurringAction.mockReset();
  });

  it("renders account, category, frequency, amount, date, and description fields", () => {
    render(<RecurringForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    expect(screen.getByLabelText("Cuenta")).toBeInTheDocument();
    expect(screen.getByLabelText("Categoría")).toBeInTheDocument();
    expect(screen.getByLabelText("Frecuencia")).toBeInTheDocument();
    expect(screen.getByLabelText("Monto (MXN)")).toBeInTheDocument();
    expect(screen.getByLabelText("Primera fecha de vencimiento")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear recurrente" })).toBeInTheDocument();
  });

  it("the frequency picker is the design-system Select — no VISIBLE raw <select> in the tree", () => {
    const { container } = render(<RecurringForm accounts={ACCOUNTS} categories={CATEGORIES} />);

    // Radix Select renders a visually-hidden native <select> internally (for plain-form-action
    // compatibility, see design-system/ui/select.tsx's header comment) — it must be
    // `aria-hidden`, never a visible/interactive raw picker.
    for (const el of container.querySelectorAll("select")) {
      expect(el).toHaveAttribute("aria-hidden", "true");
    }

    fireEvent.click(screen.getByLabelText("Frecuencia"));
    expect(screen.getByRole("option", { name: "Mensual" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Semanal" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Quincenal" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Anual" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
  });
});
