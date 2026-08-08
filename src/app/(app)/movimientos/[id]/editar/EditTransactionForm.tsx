"use client";

import { useActionState, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { Button } from "@/design-system/ui/button";
import { DatePicker } from "@/design-system/patterns/DatePicker";
import { Input } from "@/design-system/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/design-system/ui/select";
import {
  budgetDeltaForEdit,
  evaluateBudgetImpact,
  type BudgetImpact,
  type BudgetProgressItem,
} from "@/modules/finance/api/budget-evaluation";
import { pesosToCents } from "@/shared/money";
import { OverBudgetDialog } from "../../OverBudgetDialog";
import { updateMovementAction, voidMovementAction, type MovementFormState } from "../../actions";
import { subtypeOptionsForType } from "../../subtype-options";

type AccountOption = { id: string; name: string };
type CategoryOption = { id: string; name: string };

const INITIAL_STATE: MovementFormState = { error: null };

/**
 * Edit-in-place affordance (T-038): account move, amount/category/date/
 * description patch, and void with a reason. When the target is a transfer
 * leg the seam rejects the account change with `TRANSFER_LEG_NOT_MOVABLE`
 * (design.md §5.4) — the one-tap remedy is "Anular y volver a registrar",
 * which voids both legs so the user can re-enter the transfer from scratch.
 *
 * `budgets` prop (finance-budgets B-008): re-runs the same over-budget
 * check on edit via `budgetDeltaForEdit`, comparing the submitted
 * amount/category against the `transaction` prop's pre-edit values. The
 * void form is untouched.
 */
export function EditTransactionForm({
  transaction,
  accounts,
  categories,
  budgets = [],
}: {
  transaction: {
    id: string;
    accountId: string;
    categoryId: string | null;
    type: "income" | "expense" | "transfer";
    amountCents: number;
    occurredOn: string;
    description: string;
    /** change: finance-transaction-subtypes. `null` when unset. */
    subtype: string | null;
  };
  accounts: AccountOption[];
  categories: CategoryOption[];
  budgets?: BudgetProgressItem[];
}) {
  const [editState, editAction, editPending] = useActionState(updateMovementAction, INITIAL_STATE);
  const [voidState, voidAction, voidPending] = useActionState(voidMovementAction, INITIAL_STATE);
  const [, startTransition] = useTransition();
  const [pendingOverBudget, setPendingOverBudget] = useState<{ formData: FormData; impact: BudgetImpact } | null>(
    null,
  );

  const isTransferLegError = editState.error?.toLowerCase().includes("transferencia");

  function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);

    const nextCategoryId =
      transaction.type === "transfer" ? null : String(formData.get("categoryId") ?? "") || null;
    const amountRaw = formData.get("amount");
    const nextAmountCents = amountRaw ? pesosToCents(Number(amountRaw)) : Math.abs(transaction.amountCents);

    const { categoryId, deltaCents } = budgetDeltaForEdit({
      previousCategoryId: transaction.categoryId,
      previousAmountCents: Math.abs(transaction.amountCents),
      nextCategoryId,
      nextAmountCents,
    });

    const budget = categoryId ? budgets.find((b) => b.categoryId === categoryId) : undefined;
    const impact = evaluateBudgetImpact({
      limitCents: budget?.limitCents ?? null,
      spentCents: budget?.spentCents ?? 0,
      deltaCents,
    });

    if (impact.crossesLimit) {
      event.preventDefault();
      setPendingOverBudget({ formData, impact });
    }
  }

  function confirmOverBudget() {
    if (!pendingOverBudget) return;
    const { formData } = pendingOverBudget;
    setPendingOverBudget(null);
    startTransition(() => editAction(formData));
  }

  function cancelOverBudget() {
    setPendingOverBudget(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <form action={editAction} onSubmit={handleEditSubmit} className="flex flex-col gap-4">
        <h3 className="text-sm font-medium text-muted-foreground">Detalles del movimiento</h3>
        <input type="hidden" name="id" value={transaction.id} />

        <div className="flex flex-col gap-1">
          <label htmlFor="accountId" className="text-sm font-medium">
            Cuenta
          </label>
          <Select name="accountId" defaultValue={transaction.accountId}>
            <SelectTrigger id="accountId">
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

        {transaction.type !== "transfer" && (
          <div className="flex flex-col gap-1">
            <label htmlFor="categoryId" className="text-sm font-medium">
              Categoría
            </label>
            <Select name="categoryId" defaultValue={transaction.categoryId ?? undefined}>
              <SelectTrigger id="categoryId">
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
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="subtype" className="text-sm font-medium">
            Sub-tipo
          </label>
          <Select name="subtype" defaultValue={transaction.subtype ?? "none"}>
            <SelectTrigger id="subtype">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin subtipo</SelectItem>
              {subtypeOptionsForType(transaction.type).map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="amount" className="text-sm font-medium">
            Monto (MXN)
          </label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={(Math.abs(transaction.amountCents) / 100).toFixed(2)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="occurredOn" className="text-sm font-medium">
            Fecha
          </label>
          <DatePicker id="occurredOn" name="occurredOn" defaultValue={transaction.occurredOn} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-sm font-medium">
            Descripción
          </label>
          <Input id="description" name="description" defaultValue={transaction.description} maxLength={200} />
        </div>

        {editState.error && <p className="text-sm text-expense">{editState.error}</p>}
        <Button type="submit" disabled={editPending}>
          {editPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </form>

      <form action={voidAction} className="flex flex-col gap-3 border-t border-border pt-6">
        <h3 className="text-sm font-medium text-muted-foreground">Anular movimiento</h3>
        <input type="hidden" name="id" value={transaction.id} />
        <label htmlFor="reason" className="text-sm font-medium">
          Motivo de anulación
        </label>
        <Input id="reason" name="reason" placeholder="Ej. registrado por error" />
        {voidState.error && <p className="text-sm text-expense">{voidState.error}</p>}
        <Button type="submit" variant="destructive" disabled={voidPending}>
          {voidPending
            ? "Anulando…"
            : isTransferLegError
              ? "Anular y volver a registrar"
              : "Anular movimiento"}
        </Button>
      </form>

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
