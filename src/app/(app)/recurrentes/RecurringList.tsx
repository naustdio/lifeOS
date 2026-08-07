"use client";

import { Repeat } from "lucide-react";
import { useActionState, useState } from "react";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { RecurringRow } from "@/design-system/patterns/RecurringRow";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import type { BudgetProgressItem } from "@/modules/finance/api/budget-evaluation";
import { daysOverdue as computeDaysOverdue, type Frequency } from "@/modules/finance/api/recurring-schedule";
import { formatCentsAsMXN } from "@/shared/money";
import {
  deleteRecurringAction,
  discardRecurringAction,
  setRecurringActiveAction,
  type RecurringFormState,
} from "./actions";
import { ConfirmRecurringSheet } from "./ConfirmRecurringSheet";

type AccountOption = { id: string; name: string };
type CategoryOption = { id: string; name: string };

type RecurringDefinition = {
  id: string;
  accountId: string;
  // `string | null` since finance-credit-card-payments CC-020: null on a `type: "transfer"`
  // definition. Rendering the transfer-specific row shape (Origen -> Destino, no category chip)
  // is Slice C's job (tasks.md CC-027) — this widening only keeps the shared repository type
  // compiling for the still-expense-only UI this slice ships.
  categoryId: string | null;
  amountCents: number;
  description: string;
  frequency: Frequency;
  nextDueDate: string;
  active: boolean;
};

type DueItem = {
  recurringId: string;
  amountCents: number;
  description: string;
  frequency: Frequency;
  nextDueDate: string;
  daysOverdue: number;
};

const INITIAL_STATE: RecurringFormState = { error: null };
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Client list for the recurring-expenses screen (design.md §9, change: finance-recurring R-017):
 * due-first ordering, pause/delete/omit row actions, `EmptyState` for zero definitions. Confirm
 * opens `ConfirmRecurringSheet` (editable amount/date/description, over-budget gate) rather than
 * posting immediately.
 */
export function RecurringList({
  definitions,
  dueItems,
  accounts,
  categories,
  budgets,
}: {
  definitions: RecurringDefinition[];
  dueItems: DueItem[];
  accounts: AccountOption[];
  categories: CategoryOption[];
  budgets: BudgetProgressItem[];
}) {
  const [confirmTarget, setConfirmTarget] = useState<DueItem | null>(null);
  const dueById = new Map(dueItems.map((d) => [d.recurringId, d]));

  const sorted = [...definitions].sort((a, b) => {
    const overdueA = dueById.get(a.id)?.daysOverdue ?? computeDaysOverdue(a.nextDueDate, today());
    const overdueB = dueById.get(b.id)?.daysOverdue ?? computeDaysOverdue(b.nextDueDate, today());
    return overdueB - overdueA;
  });

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "";
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";
  const budgetForCategory = (categoryId: string) => budgets.find((b) => b.categoryId === categoryId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {definitions.length === 0 ? (
        <EmptyState
          icon={Repeat}
          heading="Aún no tienes recurrentes"
          description="Registra un gasto fijo (renta, suscripciones) para que te recordemos confirmarlo."
          action={
            <Button asChild variant="ghost" size="sm">
              <a href="#recurring-form">Nueva recurrente</a>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/60 py-2">
            {sorted.map((def) => {
              const due = dueById.get(def.id);
              const overdue = due?.daysOverdue ?? computeDaysOverdue(def.nextDueDate, today());
              return (
                <RecurringRowWithActions
                  key={def.id}
                  definition={def}
                  daysOverdue={overdue}
                  onConfirm={() =>
                    setConfirmTarget(
                      due ?? {
                        recurringId: def.id,
                        amountCents: def.amountCents,
                        description: def.description,
                        frequency: def.frequency,
                        nextDueDate: def.nextDueDate,
                        daysOverdue: overdue,
                      },
                    )
                  }
                />
              );
            })}
          </CardContent>
        </Card>
      )}

      {confirmTarget && (
        <ConfirmRecurringSheet
          dueItem={confirmTarget}
          budget={budgetForCategory(
            definitions.find((d) => d.id === confirmTarget.recurringId)?.categoryId ?? "",
          )}
          accountLabel={accountName(definitions.find((d) => d.id === confirmTarget.recurringId)?.accountId ?? "")}
          categoryLabel={categoryName(
            definitions.find((d) => d.id === confirmTarget.recurringId)?.categoryId ?? "",
          )}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}

function RecurringRowWithActions({
  definition,
  daysOverdue,
  onConfirm,
}: {
  definition: RecurringDefinition;
  daysOverdue: number;
  onConfirm: () => void;
}) {
  const [discardState, discardAction, discardPending] = useActionState(discardRecurringAction, INITIAL_STATE);
  const [activeState, activeAction, activePending] = useActionState(setRecurringActiveAction, INITIAL_STATE);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteRecurringAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-2 py-1">
      <RecurringRow
        description={definition.description || "Sin descripción"}
        formattedAmount={formatCentsAsMXN(-definition.amountCents)}
        frequency={definition.frequency}
        daysOverdue={daysOverdue}
        paused={!definition.active}
        onConfirm={onConfirm}
        onDiscard={() => {
          const formData = new FormData();
          formData.set("recurringId", definition.id);
          discardAction(formData);
        }}
        discardPending={discardPending}
      />
      <div className="flex items-center gap-2 pl-12">
        <form
          action={(formData) => {
            formData.set("id", definition.id);
            formData.set("active", String(!definition.active));
            formData.set("currentNextDueDate", definition.nextDueDate);
            formData.set("frequency", definition.frequency);
            activeAction(formData);
          }}
        >
          <Button type="submit" variant="ghost" size="sm" disabled={activePending}>
            {definition.active ? "Pausar" : "Reanudar"}
          </Button>
        </form>
        <form
          action={(formData) => {
            formData.set("id", definition.id);
            deleteAction(formData);
          }}
          onSubmit={(event) => {
            if (
              !window.confirm(
                "¿Eliminar esta recurrente? Sus transacciones ya registradas se conservan en el historial.",
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <Button type="submit" variant="ghost" size="sm" disabled={deletePending}>
            Eliminar
          </Button>
        </form>
      </div>
      {discardState.error && <p className="text-xs text-expense">{discardState.error}</p>}
      {activeState.error && <p className="text-xs text-expense">{activeState.error}</p>}
      {deleteState.error && <p className="text-xs text-expense">{deleteState.error}</p>}
    </div>
  );
}
