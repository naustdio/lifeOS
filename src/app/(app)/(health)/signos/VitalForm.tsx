"use client";

import { useActionState } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { DatePicker } from "@/design-system/patterns/DatePicker";
import { Input } from "@/design-system/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-system/ui/select";
import { createVitalReadingAction, type VitalFormState } from "./actions";

const INITIAL_STATE: VitalFormState = { error: null };
const today = () => new Date().toISOString().slice(0, 10);

const METRICS = [
  { value: "weight_kg", label: "Peso (kg)" },
  { value: "systolic_bp", label: "Presión sistólica" },
  { value: "diastolic_bp", label: "Presión diastólica" },
  { value: "glucose_mgdl", label: "Glucosa (mg/dL)" },
  { value: "heart_rate", label: "Frecuencia cardiaca" },
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
] as const;

export function VitalForm() {
  const [state, action, pending] = useActionState(createVitalReadingAction, INITIAL_STATE);

  return (
    <Card id="vital-form">
      <CardHeader>
        <CardTitle>Registrar signo vital</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="vitalMetric" className="text-sm font-medium">
              Métrica
            </label>
            <Select name="metric" defaultValue="weight_kg">
              <SelectTrigger id="vitalMetric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRICS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="vitalValue" className="text-sm font-medium">
              Valor
            </label>
            <Input id="vitalValue" name="valueNumeric" type="number" step="0.1" min="0.1" required />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="vitalMeasuredOn" className="text-sm font-medium">
              Fecha
            </label>
            <DatePicker id="vitalMeasuredOn" name="measuredOn" defaultValue={today()} required />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="vitalVisibility" className="text-sm font-medium">
              Visibilidad
            </label>
            <Select name="visibility" defaultValue="shared">
              <SelectTrigger id="vitalVisibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shared">Visible para todos</SelectItem>
                <SelectItem value="private">Privado — solo yo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {state.error && <p className="text-sm text-expense">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Registrar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
