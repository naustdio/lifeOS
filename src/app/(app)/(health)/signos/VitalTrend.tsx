"use client";

import { LineChart, Lock } from "lucide-react";
import { useActionState } from "react";
import { EmptyState } from "@/design-system/patterns/EmptyState";
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

const INITIAL_STATE: VitalFormState = { error: null };

/**
 * Chronological (oldest-first, per `sortForTrend`) list of readings — spec `health-vitals`
 * "Vitals Render as a Trend". A full chart is out of scope for this cycle; the ordered list with
 * date + value already satisfies "in chronological order suitable for trend display".
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

  return (
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
  );
}
