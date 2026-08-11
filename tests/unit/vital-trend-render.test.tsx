import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RTL smoke render (tasks.md 7.6, standard mode). Spec `health-vitals` "Vitals Render as a Trend"
// (change: nutrition-submodule) — a metric with entries renders as a chart, not a flat list, and
// the delete control for individual readings still exists below it.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const deleteVitalReadingAction = vi.fn();
vi.mock("@/app/(app)/(health)/signos/actions", () => ({ deleteVitalReadingAction }));

const { VitalTrend } = await import("@/app/(app)/(health)/signos/VitalTrend");

describe("VitalTrend — smoke render (nutrition-submodule)", () => {
  afterEach(() => {
    cleanup();
    deleteVitalReadingAction.mockReset();
  });

  it("renders a chart section (metric label) for a metric with entries, not only a list", () => {
    render(
      <VitalTrend
        readings={[
          { id: "r1", metric: "weight_kg", valueNumeric: 80, measuredAt: "2026-01-01T00:00:00Z", visibility: "shared" },
          { id: "r2", metric: "weight_kg", valueNumeric: 78, measuredAt: "2026-06-01T00:00:00Z", visibility: "shared" },
        ]}
      />,
    );

    expect(screen.getAllByText("Peso (kg)").length).toBeGreaterThan(0);
  });

  it("still offers a delete control per reading below the chart", () => {
    render(
      <VitalTrend
        readings={[{ id: "r1", metric: "weight_kg", valueNumeric: 80, measuredAt: "2026-01-01T00:00:00Z", visibility: "shared" }]}
      />,
    );

    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
  });

  it("includes every logged entry with no default time-window truncation", () => {
    const readings = Array.from({ length: 20 }, (_, i) => ({
      id: `r${i}`,
      metric: "weight_kg" as const,
      valueNumeric: 80 - i,
      measuredAt: `2024-${String((i % 12) + 1).padStart(2, "0")}-01T00:00:00Z`,
      visibility: "shared" as const,
    }));

    render(<VitalTrend readings={readings} />);
    expect(screen.getAllByRole("button", { name: "Eliminar" })).toHaveLength(20);
  });
});
