"use client";

import { LineChart, Lock } from "lucide-react";
import { useActionState } from "react";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { deleteVitalReadingAction, type VitalFormState } from "./actions";

type VitalReading = {
  id: string;
  metric: "weight_kg" | "systolic_bp" | "diastolic_bp" | "glucose_mgdl" | "heart_rate";
  valueNumeric: number;
  measuredAt: string;
  visibility: "shared" | "private";
};

const METRIC_LABELS: Record<VitalReading["metric"], string> = {
  weight_kg: "Peso (kg)",
  systolic_bp: "Presión sistólica",
  diastolic_bp: "Presión diastólica",
  glucose_mgdl: "Glucosa (mg/dL)",
  heart_rate: "Frecuencia cardiaca",
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
        description="Peso, presión, glucosa y frecuencia cardiaca aparecerán aquí como tendencia."
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
