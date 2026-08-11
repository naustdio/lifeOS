"use client";

import { LineChart, Lock } from "lucide-react";
import { useActionState } from "react";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { MetricTrendChart, type TrendSeries } from "@/design-system/patterns/MetricTrendChart";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import type { VitalMetric } from "@/modules/health/api";
import { deleteVitalReadingAction, type VitalFormState } from "./actions";

type VitalReading = {
  id: string;
  metric: VitalMetric;
  valueNumeric: number;
  measuredAt: string;
  visibility: "shared" | "private";
};

// change: nutrition-tracking — 14 body-composition entries added below the original 5. Every
// new label carries its unit in parentheses (design.md Decision 3's binding follow-on), matching
// the pre-existing weight_kg -> "Peso (kg)" precedent; the older BP/glucose/heart-rate labels
// are left as-is (out of scope for this change).
const METRIC_LABELS: Record<VitalMetric, string> = {
  weight_kg: "Peso (kg)",
  systolic_bp: "Presión sistólica",
  diastolic_bp: "Presión diastólica",
  glucose_mgdl: "Glucosa (mg/dL)",
  heart_rate: "Frecuencia cardiaca",
  body_fat_pct: "Grasa (%)",
  body_fat_kg: "Grasa (kg)",
  muscle_mass_pct: "Músculo (%)",
  muscle_mass_kg: "Músculo (kg)",
  skinfold_biceps_mm: "Pliegue bíceps (mm)",
  skinfold_triceps_mm: "Pliegue tríceps (mm)",
  skinfold_subscapular_mm: "Pliegue subescapular (mm)",
  skinfold_iliac_crest_mm: "Pliegue cresta ilíaca (mm)",
  skinfold_supraspinal_mm: "Pliegue supraespinal (mm)",
  skinfold_abdominal_mm: "Pliegue abdominal (mm)",
  waist_cm: "Cintura (cm)",
  hip_cm: "Cadera (cm)",
  thigh_cm: "Muslo (cm)",
  arm_flexed_cm: "Brazo contraído (cm)",
};

// change: nutrition-submodule fast-follow — live-testing feedback: mixing kg/mm/cm metrics on one
// axis looks wrong, but the same UNIT group reads fine combined with color-coded lines. Three
// bounded groups by comparable scale; the original 4 general vitals (BP/glucose/heart rate) stay
// one chart each, unchanged, since they weren't part of this feedback.
const BODY_COMPOSITION_GROUP: VitalMetric[] = ["weight_kg", "body_fat_pct", "body_fat_kg", "muscle_mass_pct", "muscle_mass_kg"];
const SKINFOLD_GROUP: VitalMetric[] = [
  "skinfold_biceps_mm",
  "skinfold_triceps_mm",
  "skinfold_subscapular_mm",
  "skinfold_iliac_crest_mm",
  "skinfold_supraspinal_mm",
  "skinfold_abdominal_mm",
];
const CIRCUMFERENCE_GROUP: VitalMetric[] = ["waist_cm", "hip_cm", "thigh_cm", "arm_flexed_cm"];
const GROUPED_METRICS = new Set<VitalMetric>([...BODY_COMPOSITION_GROUP, ...SKINFOLD_GROUP, ...CIRCUMFERENCE_GROUP]);

function toSeries(readings: VitalReading[], metric: VitalMetric): TrendSeries {
  return {
    key: metric,
    label: METRIC_LABELS[metric],
    points: readings
      .filter((r) => r.metric === metric)
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
      .map((r) => ({ measuredAt: r.measuredAt, value: r.valueNumeric })),
  };
}

const INITIAL_STATE: VitalFormState = { error: null };

/**
 * Grouped trend charts (spec `health-vitals` "Vitals Render as a Trend" — change:
 * nutrition-submodule), full history by default, plus a compact manage/delete list below —
 * deleting an individual reading is still possible, it just isn't the primary view anymore.
 */
export function VitalTrend({ readings }: { readings: VitalReading[] }) {
  const [deleteState, deleteAction, deletePending] = useActionState(deleteVitalReadingAction, INITIAL_STATE);

  if (readings.length === 0) {
    return (
      <EmptyState
        icon={LineChart}
        heading="Aún no registraste signos vitales"
        description="Peso, composición corporal, presión, glucosa y frecuencia cardiaca aparecerán aquí como tendencia."
      />
    );
  }

  const otherMetrics = Array.from(new Set(readings.map((r) => r.metric))).filter((m) => !GROUPED_METRICS.has(m));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Composición corporal</span>
        <MetricTrendChart series={BODY_COMPOSITION_GROUP.map((m) => toSeries(readings, m))} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Pliegues cutáneos</span>
        <MetricTrendChart series={SKINFOLD_GROUP.map((m) => toSeries(readings, m))} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Circunferencias</span>
        <MetricTrendChart series={CIRCUMFERENCE_GROUP.map((m) => toSeries(readings, m))} />
      </div>
      {otherMetrics.map((m) => (
        <div key={m} className="flex flex-col gap-1">
          <span className="text-sm font-medium">{METRIC_LABELS[m]}</span>
          <MetricTrendChart series={[toSeries(readings, m)]} />
        </div>
      ))}

      <Card>
        <CardContent className="divide-y divide-border/60 py-2">
          {readings.map((reading) => (
            <div key={reading.id} className="flex items-center justify-between gap-2 py-2">
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {METRIC_LABELS[reading.metric]}
                  {reading.visibility === "private" && <Lock className="ml-1 inline h-3 w-3" aria-label="Privado" />}
                </span>
                <span className="text-xs text-muted-foreground">{new Date(reading.measuredAt).toLocaleDateString("es-MX")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium tabular-nums">{reading.valueNumeric}</span>
                <form
                  action={(formData) => {
                    formData.set("id", reading.id);
                    deleteAction(formData);
                  }}
                >
                  <Button type="submit" variant="ghost" size="sm" disabled={deletePending}>
                    Eliminar
                  </Button>
                </form>
              </div>
            </div>
          ))}
          {deleteState.error && <p className="px-4 pb-2 text-xs text-expense">{deleteState.error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
