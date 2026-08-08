"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { DatePicker } from "@/design-system/patterns/DatePicker";
import { Input } from "@/design-system/ui/input";
import { evaluateBudgetImpact, type BudgetImpact, type BudgetProgressItem } from "@/modules/finance/api/budget-evaluation";
import type { Frequency } from "@/modules/finance/api/recurring-schedule";
import { pesosToCents } from "@/shared/money";
import { OverBudgetDialog } from "../movimientos/OverBudgetDialog";
import { confirmRecurringAction, type RecurringFormState } from "./actions";

type DueItem = {
  recurringId: string;
  type: "expense" | "income" | "transfer";
  toAccountId: string | null;
  amountCents: number;
  description: string;
  frequency: Frequency;
  nextDueDate: string;
  daysOverdue: number;
};

const INITIAL_STATE: RecurringFormState = { error: null };

/**
 * Confirm-with-edit sheet (design.md §9, change: finance-recurring R-018). Prefilled editable
 * amount/date/description — the date defaults to the ORIGINAL `next_due_date`, not today. The
 * over-budget gate is wired byte-identically to `TransactionForm`: `onSubmit` -> `preventDefault`
 * only when `crossesLimit` -> stash `FormData` -> confirming dispatches
 * `startTransition(() => dispatch(stashed))`.
 */
export function ConfirmRecurringSheet({
  dueItem,
  budget,
  accountLabel,
  categoryLabel,
  destinationLabel,
  onClose,
}: {
  dueItem: DueItem;
  budget: BudgetProgressItem | null;
  accountLabel: string;
  categoryLabel: string;
  /** Only meaningful when `dueItem.type === "transfer"` (design.md §4, CC-027). */
  destinationLabel?: string;
  onClose: () => void;
}) {
  const isTransfer = dueItem.type === "transfer";
  const [state, action, pending] = useActionState(confirmRecurringAction, INITIAL_STATE);
  const [, startTransition] = useTransition();
  const [pendingOverBudget, setPendingOverBudget] = useState<{ formData: FormData; impact: BudgetImpact } | null>(
    null,
  );
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (submitted && !pending && !state.error) {
      onClose();
    }
  }, [submitted, pending, state.error, onClose]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const amountCents = pesosToCents(Number(formData.get("amount") ?? 0));

    const impact = evaluateBudgetImpact({
      limitCents: budget?.limitCents ?? null,
      spentCents: budget?.spentCents ?? 0,
      deltaCents: amountCents,
    });

    if (impact.crossesLimit) {
      event.preventDefault();
      setPendingOverBudget({ formData, impact });
      return;
    }

    setSubmitted(true);
  }

  function confirmOverBudget() {
    if (!pendingOverBudget) return;
    const { formData } = pendingOverBudget;
    setPendingOverBudget(null);
    setSubmitted(true);
    startTransition(() => action(formData));
  }

  function cancelOverBudget() {
    setPendingOverBudget(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <Card className="w-full max-w-sm" onClick={(event) => event.stopPropagation()}>
        <CardContent className="flex flex-col gap-4 pt-6">
          <h3 className="text-base font-semibold">Confirmar recurrente</h3>
          <p className="text-xs text-muted-foreground">
            {isTransfer ? `${accountLabel} → ${destinationLabel ?? ""}` : `${accountLabel} · ${categoryLabel}`}
          </p>
          {/* Auto-pay proposes, never posts silently (spec: "Transfer Auto-Pay Never
              Auto-Executes") — this confirmation is the explicit user action that posts it. */}
          {isTransfer && (
            <p className="text-xs text-muted-foreground">
              Al confirmar se registrará este pago ahora. El pago automático nunca se ejecuta solo.
            </p>
          )}
          <form action={action} onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input type="hidden" name="recurringId" value={dueItem.recurringId} />
            <div className="flex flex-col gap-1">
              <label htmlFor="confirmAmount" className="text-sm font-medium">
                Monto (MXN)
              </label>
              <Input
                id="confirmAmount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={(dueItem.amountCents / 100).toFixed(2)}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="confirmOccurredOn" className="text-sm font-medium">
                Fecha
              </label>
              {/* Pre-fills with the ORIGINAL next_due_date, not today (proposal, design.md §9). */}
              <DatePicker id="confirmOccurredOn" name="occurredOn" defaultValue={dueItem.nextDueDate} required />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="confirmDescription" className="text-sm font-medium">
                Descripción
              </label>
              <Input id="confirmDescription" name="description" maxLength={200} defaultValue={dueItem.description} />
            </div>
            {state.error && <p className="text-sm text-expense">{state.error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={pending}>
                {pending ? "Confirmando…" : "Confirmar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {pendingOverBudget && pendingOverBudget.impact.limitCents !== null && (
        <OverBudgetDialog
          limitCents={pendingOverBudget.impact.limitCents}
          projectedSpentCents={pendingOverBudget.impact.projectedSpentCents}
          onConfirm={confirmOverBudget}
          onCancel={cancelOverBudget}
        />
      )}
    </div>
  );
}
