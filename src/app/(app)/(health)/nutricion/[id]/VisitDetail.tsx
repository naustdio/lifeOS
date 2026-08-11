"use client";

import { useActionState } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { DatePicker } from "@/design-system/patterns/DatePicker";
import { Input } from "@/design-system/ui/input";
import { MetricTrendChart, type TrendSeries } from "@/design-system/patterns/MetricTrendChart";
import type { VitalMetric } from "@/modules/health/api";
import {
  addVisitMetricsAction,
  addVisitPhotosAction,
  deleteVisitPhotoAction,
  type NutritionVisitFormState,
} from "../actions";

const INITIAL_STATE: NutritionVisitFormState = { error: null };
const today = () => new Date().toISOString().slice(0, 10);
const PHOTO_MAX_COUNT = 6;

const METRICS: { value: VitalMetric; label: string }[] = [
  { value: "weight_kg", label: "Peso (kg)" },
  { value: "body_fat_pct", label: "Grasa (%)" },
  { value: "body_fat_kg", label: "Grasa (kg)" },
  { value: "muscle_mass_pct", label: "Músculo (%)" },
  { value: "muscle_mass_kg", label: "Músculo (kg)" },
  { value: "skinfold_biceps_mm", label: "Pliegue bíceps (mm)" },
  { value: "skinfold_triceps_mm", label: "Pliegue tríceps (mm)" },
  { value: "skinfold_subscapular_mm", label: "Pliegue subescapular (mm)" },
  { value: "skinfold_iliac_crest_mm", label: "Pliegue cresta ilíaca (mm)" },
  { value: "skinfold_supraspinal_mm", label: "Pliegue supraespinal (mm)" },
  { value: "skinfold_abdominal_mm", label: "Pliegue abdominal (mm)" },
  { value: "waist_cm", label: "Cintura (cm)" },
  { value: "hip_cm", label: "Cadera (cm)" },
  { value: "thigh_cm", label: "Muslo (cm)" },
  { value: "arm_flexed_cm", label: "Brazo contraído (cm)" },
];

export type VisitReading = { id: string; metric: VitalMetric; valueNumeric: number; measuredAt: string };
export type VisitPhoto = { id: string; storagePath: string; signedUrl: string | null };

/**
 * Visit detail — trend chart of the visit's own linked readings, plus forms to add more metrics
 * or photos and delete existing photos (spec `health-nutrition-visits` "A Visit Is Editable After
 * Creation").
 */
export function VisitDetail({ eventId, readings, photos }: { eventId: string; readings: VisitReading[]; photos: VisitPhoto[] }) {
  const [metricsState, metricsAction, metricsPending] = useActionState(addVisitMetricsAction, INITIAL_STATE);
  const [photosState, photosAction, photosPending] = useActionState(addVisitPhotosAction, INITIAL_STATE);
  const [deletePhotoState, deletePhotoAction, deletePhotoPending] = useActionState(deleteVisitPhotoAction, INITIAL_STATE);

  const series: TrendSeries[] = METRICS.map((m) => ({
    key: m.value,
    label: m.label,
    points: readings
      .filter((r) => r.metric === m.value)
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
      .map((r) => ({ measuredAt: r.measuredAt, value: r.valueNumeric })),
  })).filter((s) => s.points.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {series.length > 0 ? (
        series.map((s) => (
          <div key={s.key} className="flex flex-col gap-1">
            <span className="text-sm font-medium">{s.label}</span>
            <MetricTrendChart series={[s]} />
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay métricas en esta visita.</p>
      )}

      {photos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fotos</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="flex flex-col gap-1">
                {photo.signedUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not an optimizable static asset
                  <img src={photo.signedUrl} alt="Foto de avance" className="aspect-square w-full rounded-lg object-cover" />
                )}
                <form
                  action={(formData) => {
                    formData.set("id", photo.id);
                    formData.set("storagePath", photo.storagePath);
                    formData.set("eventId", eventId);
                    deletePhotoAction(formData);
                  }}
                >
                  <Button type="submit" variant="ghost" size="sm" disabled={deletePhotoPending}>
                    Eliminar
                  </Button>
                </form>
              </div>
            ))}
            {deletePhotoState.error && <p className="col-span-3 text-xs text-expense">{deletePhotoState.error}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Agregar métricas</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={metricsAction} className="flex flex-col gap-3">
            <input type="hidden" name="eventId" value={eventId} />
            <div className="flex flex-col gap-1">
              <label htmlFor="addMetricsMeasuredOn" className="text-sm font-medium">
                Fecha
              </label>
              <DatePicker id="addMetricsMeasuredOn" name="measuredOn" defaultValue={today()} required />
            </div>
            {METRICS.map((m) => (
              <div key={m.value} className="flex flex-col gap-1">
                <label htmlFor={`addMetric_${m.value}`} className="text-xs text-muted-foreground">
                  {m.label}
                </label>
                <Input id={`addMetric_${m.value}`} name={`metric_${m.value}`} type="number" step="0.1" />
              </div>
            ))}
            {metricsState.error && <p className="text-sm text-expense">{metricsState.error}</p>}
            <Button type="submit" disabled={metricsPending}>
              {metricsPending ? "Guardando…" : "Agregar métricas"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agregar fotos</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={photosAction} className="flex flex-col gap-3">
            <input type="hidden" name="eventId" value={eventId} />
            <div className="flex flex-col gap-1">
              <label htmlFor="addPhotos" className="text-sm font-medium">
                Fotos (privadas, hasta {PHOTO_MAX_COUNT - photos.length} más)
              </label>
              <input id="addPhotos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple />
            </div>
            {photosState.error && <p className="text-sm text-expense">{photosState.error}</p>}
            <Button type="submit" disabled={photosPending}>
              {photosPending ? "Guardando…" : "Agregar fotos"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
