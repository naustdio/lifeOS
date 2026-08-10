"use client";

import { HeartPulse, Lock } from "lucide-react";
import { useActionState, useState } from "react";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { formatCentsAsMXN } from "@/shared/money";
import { deleteHealthEventAction, type HealthEventFormState } from "./actions";
import { EditEventSheet } from "./EditEventSheet";

type HealthEvent = {
  id: string;
  eventType: "study" | "consultation" | "medication" | "vaccine";
  title: string;
  occurredOn: string;
  notes: string;
  visibility: "shared" | "private";
  amountCents: number | null;
  recurringTransactionId: string | null;
};

const TYPE_LABELS: Record<HealthEvent["eventType"], string> = {
  study: "Estudio médico",
  consultation: "Consulta médica",
  medication: "Medicamento",
  vaccine: "Vacuna",
};

const INITIAL_STATE: HealthEventFormState = { error: null };

/**
 * List of logged health events, newest-first (already sorted server-side by
 * `health/data`'s `listEvents`). No confirm/pause step here — unlike Recurrentes, a health
 * event's cost (if any) posts immediately on creation (design.md Decision 3), so the row's only
 * action is delete.
 */
export function EventList({ events }: { events: HealthEvent[] }) {
  const [deleteState, deleteAction, deletePending] = useActionState(deleteHealthEventAction, INITIAL_STATE);
  const [editTarget, setEditTarget] = useState<HealthEvent | null>(null);

  if (events.length === 0) {
    return (
      <EmptyState
        icon={HeartPulse}
        heading="Aún no registraste eventos de salud"
        description="Estudios, consultas, medicamentos y vacunas aparecerán aquí."
      />
    );
  }

  return (
    <Card>
      <CardContent className="divide-y divide-border/60 py-2">
        {events.map((event) => (
          <div key={event.id} className="flex flex-col gap-2 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-secondary text-secondary-foreground">
                <HeartPulse className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 flex flex-col">
                <span className="truncate text-sm font-medium">
                  {event.title}
                  {event.visibility === "private" && <Lock className="ml-1 inline h-3 w-3" aria-label="Privado" />}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {TYPE_LABELS[event.eventType]} · {event.occurredOn}
                  {event.recurringTransactionId && " · Recurrente"}
                </span>
              </div>
              {event.amountCents !== null && (
                <span className="text-sm font-medium">{formatCentsAsMXN(-event.amountCents)}</span>
              )}
            </div>
            <div className="flex items-center gap-2 pl-12">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditTarget(event)}>
                Editar
              </Button>
              <form
                action={(formData) => {
                  formData.set("id", event.id);
                  deleteAction(formData);
                }}
                onSubmit={(e) => {
                  if (!window.confirm("¿Eliminar este evento de salud?")) {
                    e.preventDefault();
                  }
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
      {editTarget && <EditEventSheet event={editTarget} onClose={() => setEditTarget(null)} />}
    </Card>
  );
}
