import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MetricTrendChart } from "@/design-system/patterns/MetricTrendChart";

// RTL smoke render (tasks.md 7.5, standard mode — not RED-first per design.md Testing Strategy:
// this asserts what got built, not a pre-existing bug).
//
// sdd-verify CRITICAL-1 (nutrition-submodule): a `not.toThrow()` assertion does NOT catch a chart
// rendering with an empty/collapsed axis domain — rendering zero visible marks never throws, and
// that was exactly the real regression fixed in commit 169509d (a scale INSTANCE was passed
// instead of a scale FACTORY, so every point's data value fell outside the scale's raw default
// domain and got plotted off-canvas, invisible, while the render itself succeeded). This file now
// parses the rendered `<path>`'s actual coordinates and asserts they land inside the chart's
// visible viewport — the assertion that would have failed on the original bug.
function parsePathCoordinates(d: string): { x: number; y: number }[] {
  const matches = [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)];
  return matches.map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

describe("MetricTrendChart — smoke render (nutrition-submodule)", () => {
  afterEach(() => cleanup());

  it("renders the empty label when every series has zero points", () => {
    render(<MetricTrendChart series={[{ key: "weight_kg", label: "Peso (kg)", points: [] }]} emptyLabel="Aún nada" />);
    expect(screen.getByText("Aún nada")).toBeInTheDocument();
  });

  it("plots real, in-bounds coordinates for a non-empty series (not just a non-throwing render)", () => {
    const height = 220;
    const series = [
      {
        key: "weight_kg",
        label: "Peso (kg)",
        points: [
          { measuredAt: "2026-01-01T00:00:00Z", value: 80 },
          { measuredAt: "2026-06-01T00:00:00Z", value: 70 },
          { measuredAt: "2026-08-11T00:00:00Z", value: 97 },
        ],
      },
    ];
    const { container } = render(<MetricTrendChart series={series} height={height} />);

    const path = container.querySelector("svg path");
    expect(path).toBeTruthy();

    const d = path!.getAttribute("d") ?? "";
    const coords = parsePathCoordinates(d);
    // 3 points -> 3 plotted coordinates on the line's path.
    expect(coords.length).toBe(3);

    // With a correctly domain-inferring scale, every coordinate lands inside (or very near) the
    // chart's own viewport. With the original bug (scale instance ignoring the real data), a 2026
    // date against a ~2000-01-01/02 default time domain, or a value like 80/97 against a [0,1]
    // default linear domain, produces coordinates thousands of pixels outside this range.
    for (const { x, y } of coords) {
      expect(x).toBeGreaterThan(-50);
      expect(x).toBeLessThan(2000);
      expect(y).toBeGreaterThan(-50);
      expect(y).toBeLessThan(height + 50);
    }

    // The three distinct values must map to distinct y positions — a collapsed/degenerate domain
    // (e.g. every point falling outside range and clamped to the same edge) would flatten them.
    const distinctYs = new Set(coords.map((c) => Math.round(c.y)));
    expect(distinctYs.size).toBeGreaterThan(1);
  });
});
