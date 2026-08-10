"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { DatePicker } from "@/design-system/patterns/DatePicker";
import { Input } from "@/design-system/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-system/ui/select";
import { updateHealthEventAction, type HealthEventFormState } from "./actions";

type HealthEvent = {
  id: string;
  title: string;
  occurredOn: string;
  notes: string;
  visibility: "shared" | "private";
  amountCents: number | null;
  recurringTransactionId: string | null;
};

const INITIAL_STATE: HealthEventFormState = { error: null };

/**
 * Edit overlay for an existing health event — same "fixed inset-0 backdrop + Card" shape
 * `ConfirmRecurringSheet.tsx` already establishes for Recurrentes. The amount field only appears
 * for a one-off costed event (no `recurringTransactionId`) — see `updateHealthEventAction`'s
 * header comment for why a recurring-linked event's amount isn't editable here.
 */
export function EditEventSheet({ event, onClose }: { event: HealthEvent; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateHealthEventAction, INITIAL_STATE);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (submitted && !pending && !state.error) {
      onClose();
    }
  }, [submitted, pending, state.error, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <CardContent className="flex flex-col gap-4 pt-6">
          <h3 className="text-base font-semibold">Editar evento</h3>
          <form action={action} onSubmit={() => setSubmitted(true)} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={event.id} />

            <div className="flex flex-col gap-1">
              <label htmlFor="editEventTitle" className="text-sm font-medium">
                Título
              </label>
              <Input id="editEventTitle" name="title" maxLength={120} defaultValue={event.title} required />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="editEventOccurredOn" className="text-sm font-medium">
                Fecha
              </label>
              <DatePicker id="editEventOccurredOn" name="occurredOn" defaultValue={event.occurredOn} required />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="editEventNotes" className="text-sm font-medium">
                Notas
              </label>
              <Input id="editEventNotes" name="notes" maxLength={500} defaultValue={event.notes} />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="editEventVisibility" className="text-sm font-medium">
                Visibilidad
              </label>
              <Select name="visibility" defaultValue={event.visibility}>
                <SelectTrigger id="editEventVisibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shared">Visible para todos</SelectItem>
                  <SelectItem value="private">Privado — solo yo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {event.amountCents !== null && !event.recurringTransactionId && (
              <div className="flex flex-col gap-1">
                <label htmlFor="editEventAmount" className="text-sm font-medium">
                  Monto (MXN)
                </label>
                <Input
                  id="editEventAmount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue={(event.amountCents / 100).toFixed(2)}
                  required
                />
              </div>
            )}

            {event.amountCents !== null && event.recurringTransactionId && (
              <p className="text-xs text-muted-foreground">
                El monto de un evento recurrente se administra desde Recurrentes.
              </p>
            )}

            {state.error && <p className="text-sm text-expense">{state.error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={pending}>
                {pending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
