import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RTL smoke render (tasks.md 4.9, standard mode). Spec `health-nutrition-visits` "Legacy
// Pre-Change Nutrition Events Are Visible as Completable Visits" — a zero-metric visit renders as
// a normal, clickable row, not an error state.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const deleteNutritionVisitAction = vi.fn();
vi.mock("@/app/(app)/(health)/nutricion/actions", () => ({ deleteNutritionVisitAction }));

const { VisitList } = await import("@/app/(app)/(health)/nutricion/VisitList");

describe("VisitList — smoke render (nutrition-submodule)", () => {
  afterEach(() => {
    cleanup();
    deleteNutritionVisitAction.mockReset();
  });

  it("renders an empty state when there are no visits", () => {
    render(<VisitList visits={[]} />);
    expect(screen.getByText("Aún no registraste visitas de nutrición")).toBeInTheDocument();
  });

  it("renders a legacy zero-metric visit as a completable row, not an error", () => {
    render(
      <VisitList
        visits={[
          {
            id: "v1",
            title: "Consulta de nutrición",
            occurredOn: "2026-07-01",
            providerName: null,
            visibility: "shared",
            amountCents: null,
            metricCount: 0,
            photoCount: 0,
          },
        ]}
      />,
    );

    expect(screen.getByText("Consulta de nutrición")).toBeInTheDocument();
    expect(screen.getByText(/Sin métricas todavía/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/nutricion/v1");
  });
});
