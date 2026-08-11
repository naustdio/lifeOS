"use client";

import { defineChart, lineY } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts/tooltip";
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
 *
 * Hover/focus tooltip via `@tanstack/charts/tooltip`'s extension (second live-testing round) —
 * shows the exact date + value of the point under the cursor.
 *
 * A point may carry `current: true` (third live-testing round, visit-detail-only feature) to
 * highlight "this visit's own reading" against its metric's full history: when ANY point in a
 * series is flagged, that series renders as two marks — the full history as a thin muted
 * reference line, and only the `current` point(s) in the series' real color with a dot. A series
 * with no flagged points renders exactly as before (single colored line, unchanged for
 * `/signos`'s global view, which has no "current visit" concept).
 */
export type TrendPoint = { measuredAt: string; value: number; current?: boolean };
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

const dateTickFormat = (d: Date) => d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });

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
    // `key`/`point.key` on the tooltip's ChartPoint is the library's own internal reconciliation
    // id, NOT this mark's `key` channel value — so the series identity for the tooltip has to
    // travel through the DATUM itself (`seriesLabel`), not be looked up from a point key.
    marks: nonEmptySeries.flatMap((s, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length];
      const points = s.points.map((p) => ({ ...p, seriesLabel: s.label }));
      const hasCurrentFlag = points.some((p) => p.current);

      if (!hasCurrentFlag) {
        return [
          lineY(points, {
            key: () => s.key,
            stroke: () => color,
            x: (p: TrendPoint) => new Date(p.measuredAt),
            y: (p: TrendPoint) => p.value,
            points: true,
          }),
        ];
      }

      const currentPoints = points.filter((p) => p.current);
      return [
        lineY(points, {
          key: () => `${s.key}-history`,
          stroke: () => "var(--muted-foreground)",
          strokeWidth: 1,
          x: (p: TrendPoint) => new Date(p.measuredAt),
          y: (p: TrendPoint) => p.value,
        }),
        lineY(currentPoints, {
          key: () => `${s.key}-current`,
          stroke: () => color,
          strokeWidth: 2.5,
          x: (p: TrendPoint) => new Date(p.measuredAt),
          y: (p: TrendPoint) => p.value,
          points: true,
        }),
      ];
    }),
    // Pass the SCALE FACTORY (not a called instance) — a factory infers its domain from the
    // materialized mark data; a pre-built instance keeps whatever domain it was constructed with,
    // which for `scaleLinear()`/`scaleTime()` with no `.domain()` call is d3's raw default
    // ([0,1] / [2000-01-01, 2000-01-02]) — the exact empty-looking axes this was producing.
    // A dates-only tick format (no time-of-day) — readings only ever carry a DATE, never a real
    // time, so an hour-level tick ("06 AM") is a display artifact of a narrow inferred domain,
    // not real data.
    x: { scale: scaleTime, nice: true, grid: true, axis: { ticks: { format: dateTickFormat } } },
    y: { scale: scaleLinear, nice: true, grid: true },
    tooltip,
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <Chart
          definition={definition}
          ariaLabel={nonEmptySeries.map((s) => s.label).join(", ")}
          height={height}
          renderTooltipBody={({ points, defaultBody }) => {
            const point = points[0] as { datum: TrendPoint & { seriesLabel: string } } | undefined;
            if (!point) return defaultBody;
            const date = new Date(point.datum.measuredAt).toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
            return (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground">{date}</span>
                <span className="text-sm font-medium">
                  {point.datum.seriesLabel}: {point.datum.value}
                </span>
              </div>
            );
          }}
        />
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
