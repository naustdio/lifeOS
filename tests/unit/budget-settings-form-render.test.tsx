import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RTL smoke-render for `BudgetSettingsForm`: reset-day input, the scheduled-as-spent toggle, the
 * monthly-total opt-in toggle revealing an amount field, and the "asignado" checkmark appearing
 * only when the typed total matches the sum of per-category limits exactly.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const saveBudgetSettingsAction = vi.fn();
vi.mock("@/app/(app)/(finance)/presupuestos/actions", () => ({ saveBudgetSettingsAction }));

const { BudgetSettingsForm } = await import("@/app/(app)/(finance)/presupuestos/BudgetSettingsForm");

describe("BudgetSettingsForm — smoke render", () => {
  afterEach(() => {
    cleanup();
    saveBudgetSettingsAction.mockReset();
  });

  it("renders the reset-day input and the scheduled-as-spent toggle with their initial values", () => {
    render(
      <BudgetSettingsForm
        resetDay={20}
        monthlyTotalCents={null}
        includeScheduledAsSpent={true}
        sumOfCategoryLimitsCents={0}
      />,
    );

    expect(screen.getByLabelText("Día de reinicio del periodo")).toHaveValue(20);
    expect(screen.getByLabelText("Incluir trans. programadas en cálculo de gastado")).toBeChecked();
  });

  it("the monthly-total amount field is hidden until the toggle is enabled", () => {
    render(
      <BudgetSettingsForm
        resetDay={1}
        monthlyTotalCents={null}
        includeScheduledAsSpent={false}
        sumOfCategoryLimitsCents={0}
      />,
    );

    expect(screen.queryByLabelText("Presupuesto mensual total (MXN)")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Presupuesto Mensual"));

    expect(screen.getByLabelText("Presupuesto mensual total (MXN)")).toBeInTheDocument();
  });

  it("shows the asignado checkmark only when the configured total matches the sum of category limits", () => {
    render(
      <BudgetSettingsForm
        resetDay={1}
        monthlyTotalCents={500000}
        includeScheduledAsSpent={false}
        sumOfCategoryLimitsCents={500000}
      />,
    );

    expect(screen.getByText("✓ Presupuesto mensual total asignado")).toBeInTheDocument();
  });

  it("does not show the asignado checkmark when the total and category-limit sum differ", () => {
    render(
      <BudgetSettingsForm
        resetDay={1}
        monthlyTotalCents={500000}
        includeScheduledAsSpent={false}
        sumOfCategoryLimitsCents={300000}
      />,
    );

    expect(screen.queryByText("✓ Presupuesto mensual total asignado")).not.toBeInTheDocument();
  });
});
