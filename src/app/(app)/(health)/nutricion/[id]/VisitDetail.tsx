"use client";

import { useActionState } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { DatePicker } from "@/design-system/patterns/DatePicker";
import { Input } from "@/design-system/ui/input";
import { MetricTrendChart, type TrendSeries } from "@/design-system/patterns/MetricTrendChart";
import { PhotoPickerGrid } from "@/design-system/patterns/PhotoPickerGrid";
import type { VitalMetric } from "@/modules/health/api";
import {
  addVisitMetricsAction,
  addVisitPhotosAction,
  deleteVisitPhotoAction,
  type NutritionVisitFormState,
} from "../actions";

const INITIAL_STATE: NutritionVisitFormState = { error: null };
const PHOTO_MAX_COUNT = 6;
const today = () => new Date().toISOString().slice(0, 10);

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

// change: nutrition-submodule fast-follow — same scale-bounded groups as `/signos`'s VitalTrend,
// so a visit's own chart reads the same way as the global trend view.
const WEIGHT_GROUP: VitalMetric[] = ["weight_kg"];
const FAT_GROUP: VitalMetric[] = ["body_fat_pct", "body_fat_kg"];
const MUSCLE_GROUP: VitalMetric[] = ["muscle_mass_pct", "muscle_mass_kg"];
const SKINFOLD_GROUP: VitalMetric[] = [
  "skinfold_biceps_mm",
  "skinfold_triceps_mm",
  "skinfold_subscapular_mm",
  "skinfold_iliac_crest_mm",
  "skinfold_supraspinal_mm",
  "skinfold_abdominal_mm",
];
const CIRCUMFERENCE_GROUP: VitalMetric[] = ["waist_cm", "hip_cm", "thigh_cm", "arm_flexed_cm"];

export type VisitReading = { id: string; metric: VitalMetric; valueNumeric: number; measuredAt: string; eventId: string | null };
export type VisitPhoto = { id: string; storagePath: string; signedUrl: string | null };

// change: nutrition-submodule fast-follow (3rd round) — `readings` is now the household's FULL
// history for every metric, not just this visit's own. Each point flags `current` when it
// belongs to THIS visit's `eventId`, so `MetricTrendChart` can render it highlighted against the
// muted full-history line (live-testing ask: "poder comparar los registros pasados... con el
// color se ve el registro de esa consulta").
function toSeries(eventId: string, readings: VisitReading[], metric: VitalMetric): TrendSeries {
  return {
    key: metric,
    label: METRIC_LABELS[metric],
    points: readings
      .filter((r) => r.metric === metric)
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
      .map((r) => ({ measuredAt: r.measuredAt, value: r.valueNumeric, current: r.eventId === eventId })),
  };
}

/**
 * Visit detail — trend charts of this visit's own readings highlighted against the metric's full
 * history, grouped the same way as `/signos`, plus photo management. The "add metrics" form only
 * appears for a visit with ZERO of ITS OWN readings (a legacy pre-`/nutricion` event being
 * completed, spec `health-nutrition-visits` "Legacy Pre-Change Nutrition Events Are Visible as
 * Completable Visits") — a visit that already has metrics never shows it again, since a later
 * measurement is a new visit, not an edit to this one (live-testing feedback).
 */
export function VisitDetail({ eventId, readings, photos }: { eventId: string; readings: VisitReading[]; photos: VisitPhoto[] }) {
  const [metricsState, metricsAction, metricsPending] = useActionState(addVisitMetricsAction, INITIAL_STATE);
  const [photosState, photosAction, photosPending] = useActionState(addVisitPhotosAction, INITIAL_STATE);
  const [deletePhotoState, deletePhotoAction, deletePhotoPending] = useActionState(deleteVisitPhotoAction, INITIAL_STATE);

  const hasAnyReading = readings.some((r) => r.eventId === eventId);

  return (
    <div className="flex flex-col gap-6">
      {hasAnyReading ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Peso</span>
            <MetricTrendChart series={WEIGHT_GROUP.map((m) => toSeries(eventId, readings, m))} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Grasa</span>
            <MetricTrendChart series={FAT_GROUP.map((m) => toSeries(eventId, readings, m))} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Músculo</span>
            <MetricTrendChart series={MUSCLE_GROUP.map((m) => toSeries(eventId, readings, m))} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Pliegues cutáneos</span>
            <MetricTrendChart series={SKINFOLD_GROUP.map((m) => toSeries(eventId, readings, m))} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Circunferencias</span>
            <MetricTrendChart series={CIRCUMFERENCE_GROUP.map((m) => toSeries(eventId, readings, m))} />
          </div>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Completar métricas de esta visita</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={metricsAction} className="flex flex-col gap-3">
              <input type="hidden" name="eventId" value={eventId} />
              <div className="flex flex-col gap-1">
                <label htmlFor="completeMetricsMeasuredOn" className="text-sm font-medium">
                  Fecha
                </label>
                <DatePicker id="completeMetricsMeasuredOn" name="measuredOn" defaultValue={today()} required />
              </div>
              {Object.entries(METRIC_LABELS).map(([metric, label]) => (
                <div key={metric} className="flex flex-col gap-1">
                  <label htmlFor={`completeMetric_${metric}`} className="text-xs text-muted-foreground">
                    {label}
                  </label>
                  <Input id={`completeMetric_${metric}`} name={`metric_${metric}`} type="number" step="0.1" />
                </div>
              ))}
              {metricsState.error && <p className="text-sm text-expense">{metricsState.error}</p>}
              <Button type="submit" disabled={metricsPending}>
                {metricsPending ? "Guardando…" : "Guardar métricas"}
              </Button>
            </form>
          </CardContent>
        </Card>
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
          <CardTitle>Agregar fotos</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={photosAction} className="flex flex-col gap-3">
            <input type="hidden" name="eventId" value={eventId} />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Privadas, hasta {PHOTO_MAX_COUNT - photos.length} más</span>
              <PhotoPickerGrid name="photos" maxImages={Math.max(PHOTO_MAX_COUNT - photos.length, 0)} />
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
