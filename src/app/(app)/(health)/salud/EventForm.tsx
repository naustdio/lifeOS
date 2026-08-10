"use client";

import { useActionState, useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { DatePicker } from "@/design-system/patterns/DatePicker";
import { Input } from "@/design-system/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-system/ui/select";
import { createHealthEventAction, type HealthEventFormState } from "./actions";

type AccountOption = { id: string; name: string };
type CategoryOption = { id: string; name: string };

const INITIAL_STATE: HealthEventFormState = { error: null };
const today = () => new Date().toISOString().slice(0, 10);

const EVENT_TYPES = [
  { value: "study", label: "Estudio médico" },
  { value: "consultation", label: "Consulta médica" },
  { value: "medication", label: "Medicamento" },
  { value: "vaccine", label: "Vacuna" },
  { value: "nutrition", label: "Nutrición" },
] as const;

const FREQUENCIES = [
  { value: "monthly", label: "Mensual" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quincenal" },
  { value: "yearly", label: "Anual" },
] as const;

/**
 * Event-creation form (design.md Interfaces `CreateHealthEventInputSchema`, change:
 * health-tracking). Uses the design-system `Select`/`DatePicker` — never a raw `<select>`/
 * `<input type="date">` (standing `finance-ui-polish`/`finance-date-picker` convention).
 * `visibility` defaults to `household` (spec `health-privacy`); the cost/recurrence fieldsets are
 * conditionally revealed, mirroring `TransactionForm`'s tab-conditional-fields shape.
 */
export function EventForm({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const [state, action, pending] = useActionState(createHealthEventAction, INITIAL_STATE);
  const [eventType, setEventType] = useState<(typeof EVENT_TYPES)[number]["value"]>("consultation");
  const [hasCost, setHasCost] = useState(false);
  const [recurrenceMode, setRecurrenceMode] = useState<"none" | "unbounded" | "bounded">("none");
  // Generated once per form mount, resent unchanged on every retry of the SAME submission (spec
  // `health-events` "a retried log submission MUST NOT create a second transaction") — a fresh id
  // only appears after a genuinely new mount (e.g. the form resets post-success).
  const [clientEventId] = useState(() => crypto.randomUUID());

  return (
    <Card id="health-event-form">
      <CardHeader>
        <CardTitle>Nuevo evento de salud</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="clientEventId" value={clientEventId} />
          <div className="flex flex-col gap-1">
            <label htmlFor="eventType" className="text-sm font-medium">
              Tipo
            </label>
            <Select name="eventType" value={eventType} onValueChange={(v) => setEventType(v as typeof eventType)}>
              <SelectTrigger id="eventType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="eventTitle" className="text-sm font-medium">
              Título
            </label>
            <Input id="eventTitle" name="title" maxLength={120} required />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="eventOccurredOn" className="text-sm font-medium">
              Fecha
            </label>
            <DatePicker id="eventOccurredOn" name="occurredOn" defaultValue={today()} required />
          </div>

          {eventType === "study" && (
            <div className="flex flex-col gap-1">
              <label htmlFor="eventResultSummary" className="text-sm font-medium">
                Resultado
              </label>
              <Input id="eventResultSummary" name="resultSummary" maxLength={500} />
            </div>
          )}

          {(eventType === "medication" || eventType === "vaccine") && (
            <div className="flex flex-col gap-1">
              <label htmlFor="eventDosage" className="text-sm font-medium">
                Dosis
              </label>
              <Input id="eventDosage" name="dosage" maxLength={100} />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="eventProviderName" className="text-sm font-medium">
              Proveedor (doctor, laboratorio, farmacia)
            </label>
            <Input id="eventProviderName" name="providerName" maxLength={120} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="eventNotes" className="text-sm font-medium">
              Notas
            </label>
            <Input id="eventNotes" name="notes" maxLength={500} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="eventVisibility" className="text-sm font-medium">
              Visibilidad
            </label>
            <Select name="visibility" defaultValue="shared">
              <SelectTrigger id="eventVisibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shared">Visible para todos</SelectItem>
                <SelectItem value="private">Privado — solo yo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label htmlFor="eventHasCost" className="flex items-center gap-2 text-sm font-medium">
            <input
              id="eventHasCost"
              name="hasCost"
              type="checkbox"
              checked={hasCost}
              onChange={(e) => setHasCost(e.target.checked)}
            />
            Este evento tiene un costo
          </label>

          {hasCost && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="eventAccountId" className="text-sm font-medium">
                  Cuenta
                </label>
                <Select name="accountId" defaultValue={accounts[0]?.id}>
                  <SelectTrigger id="eventAccountId">
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
                <label htmlFor="eventCategoryId" className="text-sm font-medium">
                  Categoría
                </label>
                <Select name="categoryId" defaultValue={categories[0]?.id}>
                  <SelectTrigger id="eventCategoryId">
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
                <label htmlFor="eventAmount" className="text-sm font-medium">
                  Monto (MXN)
                </label>
                <Input id="eventAmount" name="amount" type="number" step="0.01" min="0.01" required />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="eventRecurrenceMode" className="text-sm font-medium">
                  Recurrencia
                </label>
                <Select
                  name="recurrenceMode"
                  value={recurrenceMode}
                  onValueChange={(v) => setRecurrenceMode(v as typeof recurrenceMode)}
                >
                  <SelectTrigger id="eventRecurrenceMode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Solo esta vez</SelectItem>
                    <SelectItem value="unbounded">Recurrente sin fin</SelectItem>
                    <SelectItem value="bounded">Recurrente con número fijo de veces</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {recurrenceMode === "unbounded" && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="eventFrequency" className="text-sm font-medium">
                    Frecuencia
                  </label>
                  <Select name="frequency" defaultValue="monthly">
                    <SelectTrigger id="eventFrequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {recurrenceMode === "bounded" && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="eventTotalOccurrences" className="text-sm font-medium">
                    Número de veces
                  </label>
                  <Input id="eventTotalOccurrences" name="totalOccurrences" type="number" min="2" max="60" step="1" required />
                  <p className="text-xs text-muted-foreground">
                    Cada ocurrencia se cobra mensualmente (ej. un tratamiento de 3 dosis).
                  </p>
                </div>
              )}
            </>
          )}

          {state.error && <p className="text-sm text-expense">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Registrar evento"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
