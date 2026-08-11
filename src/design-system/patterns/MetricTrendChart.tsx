"use client";

import { defineChart, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/react-charts";
import { scaleLinear, scaleTime } from "d3-scale";
import { Card, CardContent } from "@/design-system/ui/card";

/**
 * Shared trend chart for a health metric's readings over time (design.md Decision 5,
 * nutrition-submodule). Deliberately takes ONLY primitive props — no `VitalMetric`/module-domain
 * import — because `boundaries/element-types` allows `design-system -> design-system | shared`
 * only; a domain import here would fail Gate A. This is also what lets `/signos`'s `VitalTrend`
 * and the `/nutricion` visit detail reuse the exact same component. Renders full history by
 * default (settled decision, nutrition-submodule proposal §5) — the caller windows the `points`
 * array if it ever wants a narrower range; this component never truncates on its own.
 */
export type TrendPoint = { measuredAt: string; value: number };
export type TrendSeries = { key: string; label: string; points: TrendPoint[] };

export type MetricTrendChartProps = {
  series: TrendSeries[];
  height?: number;
  emptyLabel?: string;
};

export function MetricTrendChart({ series, height = 220, emptyLabel = "Sin datos todavía." }: MetricTrendChartProps) {
  const hasPoints = series.some((s) => s.points.length > 0);

  if (!hasPoints) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          {emptyLabel}
        </CardContent>
      </Card>
    );
  }

  const definition = defineChart({
    marks: series.map((s) =>
      lineY(s.points, {
        key: () => s.key,
        color: () => s.key,
        x: (p: TrendPoint) => new Date(p.measuredAt),
        y: (p: TrendPoint) => p.value,
        points: true,
      }),
    ),
    x: { scale: scaleTime() },
    y: { scale: scaleLinear() },
  });

  return (
    <Card>
      <CardContent className="py-4">
        <Chart definition={definition} ariaLabel={series.map((s) => s.label).join(", ")} height={height} />
      </CardContent>
    </Card>
  );
}
