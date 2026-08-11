"use client";

import { useActionState, useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { DatePicker } from "@/design-system/patterns/DatePicker";
import { Input } from "@/design-system/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-system/ui/select";
import type { VitalMetric } from "@/modules/health/api";
import { createNutritionVisitAction, type NutritionVisitFormState } from "./actions";

type AccountOption = { id: string; name: string };
type CategoryOption = { id: string; name: string };

const INITIAL_STATE: NutritionVisitFormState = { error: null };
const today = () => new Date().toISOString().slice(0, 10);
const PHOTO_MAX_COUNT = 6;

// change: nutrition-submodule — same metric grid VitalForm offers (design.md task 4.3: "reuse
// VitalForm's metric list"), rendered as one optional numeric input per metric instead of a
// single Select+value pair, since a visit can capture several metrics at once.
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

// change: nutrition-submodule fast-follow — the shared `<details>` section style used below,
// native HTML disclosure (no new dependency) matching the "compact accordion, collapsed by
// default" live-testing feedback.
const SECTION_CLASS = "rounded-lg border border-border/60 px-3 py-2 [&_summary]:cursor-pointer [&_summary]:list-none";

/**
 * Nutrition visit creation form — spec `health-nutrition-visits` "A Visit Is a Composed Record":
 * event fields + metric grid + photo upload all submit together as one visit. The sole creation
 * path (spec "`/nutricion` Is the Sole Creation Path for Visits"). Collapsed behind a "Nueva
 * visita" button, and internally split into `<details>` sections (Datos básicos / Métricas /
 * Fotos / Costo) — live-testing feedback: the flat 20+ field form was too long/heavy to scan.
 */
export function VisitForm({ accounts, categories }: { accounts: AccountOption[]; categories: CategoryOption[] }) {
  const [state, action, pending] = useActionState(createNutritionVisitAction, INITIAL_STATE);
  const [open, setOpen] = useState(false);
  const [hasCost, setHasCost] = useState(false);
  const [photoCount, setPhotoCount] = useState(0);
  const [clientEventId] = useState(() => crypto.randomUUID());

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)} className="w-full">
        + Nueva visita
      </Button>
    );
  }

  return (
    <Card id="nutrition-visit-form">
      <CardHeader>
        <CardTitle>Nueva visita de nutrición</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="clientEventId" value={clientEventId} />

          <details open className={SECTION_CLASS}>
            <summary className="text-sm font-medium">Datos básicos</summary>
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="visitTitle" className="text-sm font-medium">
                  Título
                </label>
                <Input id="visitTitle" name="title" maxLength={120} required defaultValue="Consulta de nutrición" />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="visitOccurredOn" className="text-sm font-medium">
                  Fecha
                </label>
                <DatePicker id="visitOccurredOn" name="occurredOn" defaultValue={today()} required />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="visitProviderName" className="text-sm font-medium">
                  Nutriólogo
                </label>
                <Input id="visitProviderName" name="providerName" maxLength={120} />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="visitNotes" className="text-sm font-medium">
                  Notas
                </label>
                <Input id="visitNotes" name="notes" maxLength={500} />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="visitVisibility" className="text-sm font-medium">
                  Visibilidad
                </label>
                <Select name="visibility" defaultValue="shared">
                  <SelectTrigger id="visitVisibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared">Visible para todos</SelectItem>
                    <SelectItem value="private">Privado — solo yo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </details>

          <details className={SECTION_CLASS}>
            <summary className="text-sm font-medium">Métricas de esta visita</summary>
            <div className="mt-3 flex flex-col gap-3">
              {METRICS.map((m) => (
                <div key={m.value} className="flex flex-col gap-1">
                  <label htmlFor={`metric_${m.value}`} className="text-xs text-muted-foreground">
                    {m.label}
                  </label>
                  <Input id={`metric_${m.value}`} name={`metric_${m.value}`} type="number" step="0.1" />
                </div>
              ))}
            </div>
          </details>

          <details className={SECTION_CLASS}>
            <summary className="text-sm font-medium">Fotos de avance</summary>
            <div className="mt-3 flex flex-col gap-1">
              <label htmlFor="visitPhotos" className="text-sm font-medium">
                Privadas, máx. {PHOTO_MAX_COUNT}
              </label>
              <input
                id="visitPhotos"
                name="photos"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => setPhotoCount(e.target.files?.length ?? 0)}
              />
              {photoCount > PHOTO_MAX_COUNT && (
                <p className="text-xs text-expense">Máximo {PHOTO_MAX_COUNT} fotos por visita.</p>
              )}
            </div>
          </details>

          <details className={SECTION_CLASS}>
            <summary className="text-sm font-medium">Costo</summary>
            <div className="mt-3 flex flex-col gap-3">
              <label htmlFor="visitHasCost" className="flex items-center gap-2 text-sm font-medium">
                <input
                  id="visitHasCost"
                  name="hasCost"
                  type="checkbox"
                  checked={hasCost}
                  onChange={(e) => setHasCost(e.target.checked)}
                />
                Esta visita tiene un costo
              </label>

              {hasCost && (
                <>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="visitAccountId" className="text-sm font-medium">
                      Cuenta
                    </label>
                    <Select name="accountId" defaultValue={accounts[0]?.id}>
                      <SelectTrigger id="visitAccountId">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor="visitCategoryId" className="text-sm font-medium">
                      Categoría
                    </label>
                    <Select name="categoryId" defaultValue={categories[0]?.id}>
                      <SelectTrigger id="visitCategoryId">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor="visitAmount" className="text-sm font-medium">
                      Monto (MXN)
                    </label>
                    <Input id="visitAmount" name="amount" type="number" step="0.01" min="0.01" required />
                  </div>
                </>
              )}
            </div>
          </details>

          {state.error && <p className="text-sm text-expense">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="flex-1">
              {pending ? "Guardando…" : "Registrar visita"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
