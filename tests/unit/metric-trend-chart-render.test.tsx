import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MetricTrendChart } from "@/design-system/patterns/MetricTrendChart";

// RTL smoke render (tasks.md 7.5, standard mode — not RED-first per design.md Testing Strategy:
// this asserts what got built, not a pre-existing bug).
describe("MetricTrendChart — smoke render (nutrition-submodule)", () => {
  afterEach(() => cleanup());

  it("renders the empty label when every series has zero points", () => {
    render(<MetricTrendChart series={[{ key: "weight_kg", label: "Peso (kg)", points: [] }]} emptyLabel="Aún nada" />);
    expect(screen.getByText("Aún nada")).toBeInTheDocument();
  });

  it("renders a chart without throwing for a non-empty series", () => {
    const series = [
      {
        key: "weight_kg",
        label: "Peso (kg)",
        points: [
          { measuredAt: "2026-01-01T00:00:00Z", value: 80 },
          { measuredAt: "2026-02-01T00:00:00Z", value: 78 },
        ],
      },
    ];
    expect(() => render(<MetricTrendChart series={series} />)).not.toThrow();
  });
});
