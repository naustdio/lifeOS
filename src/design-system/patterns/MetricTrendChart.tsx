"use client";

import { defineChart, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/react-charts";
import { scaleLinear, scaleTime } from "d3-scale";
import { Card, CardContent } from "@/design-system/ui/card";

/**
 * Shared trend chart for one or more health metrics' readings over time (design.md Decision 5,
 * nutrition-submodule). Deliberately takes ONLY primitive props — no `VitalMetric`/module-domain
 * import — because `boundaries/element-types` allows `design-system -> design-system | shared`
 * only; a domain import here would fail Gate A. This is also what lets `/signos`'s `VitalTrend`
 * and the `/nutricion` visit detail reuse the exact same component. Renders full history by
 * default (settled decision, nutrition-submodule proposal §5) — the caller windows the `points`
 * array if it ever wants a narrower range; this component never truncates on its own.
 *
 * Multiple series render as colored lines on ONE shared axis (nutrition-submodule fast-follow —
 * live-testing showed metrics with wildly different scales, e.g. kg vs mm vs cm, look wrong
 * combined; callers are expected to only group series that share a comparable unit/range). Colors
 * come from a fixed `--chart-series-N` token rotation (`tokens/semantic.css`), not the chart
 * library's automatic categorical assignment, so the manual legend below always matches exactly.
 */
export type TrendPoint = { measuredAt: string; value: number };
export type TrendSeries = { key: string; label: string; points: TrendPoint[] };

export type MetricTrendChartProps = {
  series: TrendSeries[];
  height?: number;
  emptyLabel?: string;
};

const SERIES_COLORS = [
  "var(--chart-series-1)",
  "var(--chart-series-2)",
  "var(--chart-series-3)",
  "var(--chart-series-4)",
  "var(--chart-series-5)",
  "var(--chart-series-6)",
];

export function MetricTrendChart({ series, height = 220, emptyLabel = "Sin datos todavía." }: MetricTrendChartProps) {
  const nonEmptySeries = series.filter((s) => s.points.length > 0);

  if (nonEmptySeries.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          {emptyLabel}
        </CardContent>
      </Card>
    );
  }

  const definition = defineChart({
    marks: nonEmptySeries.map((s, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length];
      return lineY(s.points, {
        key: () => s.key,
        stroke: () => color,
        x: (p: TrendPoint) => new Date(p.measuredAt),
        y: (p: TrendPoint) => p.value,
        points: true,
      });
    }),
    // Pass the SCALE FACTORY (not a called instance) — a factory infers its domain from the
    // materialized mark data; a pre-built instance keeps whatever domain it was constructed with,
    // which for `scaleLinear()`/`scaleTime()` with no `.domain()` call is d3's raw default
    // ([0,1] / [2000-01-01, 2000-01-02]) — the exact empty-looking axes this was producing.
    x: { scale: scaleTime, nice: true },
    y: { scale: scaleLinear, nice: true },
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <Chart definition={definition} ariaLabel={nonEmptySeries.map((s) => s.label).join(", ")} height={height} />
        {nonEmptySeries.length > 1 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-2">
            {nonEmptySeries.map((s, i) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
                  aria-hidden
                />
                {s.label}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
