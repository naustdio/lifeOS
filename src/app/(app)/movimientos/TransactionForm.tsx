"use client";

import { useActionState, useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Input } from "@/design-system/ui/input";
import { recordMovementAction, recordTransferAction, type MovementFormState } from "./actions";

type AccountOption = { id: string; name: string };
type CategoryOption = { id: string; name: string; kind: "income" | "expense" };

const INITIAL_STATE: MovementFormState = { error: null };
const today = () => new Date().toISOString().slice(0, 10);

/** Income/expense/transfer entry form (T-037). No "who paid" field — that
 * field is hidden in personal-mode UI (`finance-transactions/
 * paid_by_user_id Hidden From Personal-Mode UI`). Category picker only
 * receives active categories (already excluded upstream). */
export function TransactionForm({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const [tab, setTab] = useState<"expense" | "income" | "transfer">("expense");
  const [movementState, movementAction, movementPending] = useActionState(recordMovementAction, INITIAL_STATE);
  const [transferState, transferAction, transferPending] = useActionState(recordTransferAction, INITIAL_STATE);

  const visibleCategories = categories.filter((c) => c.kind === tab);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(["expense", "income", "transfer"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={
              "flex-1 rounded-pill px-4 py-2 text-sm font-medium " +
              (tab === option ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")
            }
          >
            {option === "expense" ? "Gasto" : option === "income" ? "Ingreso" : "Transferencia"}
          </button>
        ))}
      </div>

      {tab !== "transfer" && (
        <form action={movementAction} className="flex flex-col gap-4">
          <input type="hidden" name="kind" value={tab} />
          <div className="flex flex-col gap-1">
            <label htmlFor="accountId" className="text-sm font-medium">
              Cuenta
            </label>
            <select id="accountId" name="accountId" required className="h-11 rounded-card border border-input bg-surface px-4 text-sm">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="categoryId" className="text-sm font-medium">
              Categoría
            </label>
            <select id="categoryId" name="categoryId" required className="h-11 rounded-card border border-input bg-surface px-4 text-sm">
              {visibleCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="amount" className="text-sm font-medium">
              Monto (MXN)
            </label>
            <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="occurredOn" className="text-sm font-medium">
              Fecha
            </label>
            <Input id="occurredOn" name="occurredOn" type="date" defaultValue={today()} required />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="description" className="text-sm font-medium">
              Descripción
            </label>
            <Input id="description" name="description" maxLength={200} />
          </div>
          {movementState.error && <p className="text-sm text-expense">{movementState.error}</p>}
          <Button type="submit" disabled={movementPending}>
            {movementPending ? "Guardando…" : tab === "expense" ? "Registrar gasto" : "Registrar ingreso"}
          </Button>
        </form>
      )}

      {tab === "transfer" && (
        <form action={transferAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="fromAccountId" className="text-sm font-medium">
              Desde
            </label>
            <select id="fromAccountId" name="fromAccountId" required className="h-11 rounded-card border border-input bg-surface px-4 text-sm">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="toAccountId" className="text-sm font-medium">
              Hacia
            </label>
            <select id="toAccountId" name="toAccountId" required className="h-11 rounded-card border border-input bg-surface px-4 text-sm">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="transferAmount" className="text-sm font-medium">
              Monto (MXN)
            </label>
            <Input id="transferAmount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="transferOccurredOn" className="text-sm font-medium">
              Fecha
            </label>
            <Input id="transferOccurredOn" name="occurredOn" type="date" defaultValue={today()} required />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="transferDescription" className="text-sm font-medium">
              Descripción
            </label>
            <Input id="transferDescription" name="description" maxLength={200} />
          </div>
          {transferState.error && <p className="text-sm text-expense">{transferState.error}</p>}
          <Button type="submit" disabled={transferPending}>
            {transferPending ? "Guardando…" : "Registrar transferencia"}
          </Button>
        </form>
      )}
    </div>
  );
}
