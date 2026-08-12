"use client";

import { useActionState, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { DatePicker } from "@/design-system/patterns/DatePicker";
import { Button } from "@/design-system/ui/button";
import { Input } from "@/design-system/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/design-system/ui/select";
import {
  evaluateBudgetImpact,
  type BudgetImpact,
  type BudgetProgressItem,
} from "@/modules/finance/api/budget-evaluation";
import { pesosToCents } from "@/shared/money";
import { OverBudgetDialog } from "./OverBudgetDialog";
import {
  recordInstallmentPurchaseAction,
  recordMovementAction,
  recordTransferAction,
  type MovementFormState,
} from "./actions";
import { SUBTYPE_OPTIONS_BY_TAB } from "./subtype-options";

type AccountOption = { id: string; name: string; type?: string };
type CategoryOption = { id: string; name: string; kind: "income" | "expense" };

const INITIAL_STATE: MovementFormState = { error: null };
const today = () => new Date().toISOString().slice(0, 10);

/** Income/expense/transfer entry form (T-037). No "who paid" field — that
 * field is hidden in personal-mode UI (`finance-transactions/
 * paid_by_user_id Hidden From Personal-Mode UI`). Category picker only
 * receives active categories (already excluded upstream).
 *
 * `budgets` prop (finance-budgets B-007): the expense tab only gates
 * submission behind a non-blocking over-budget confirmation
 * (`evaluateBudgetImpact`) before dispatching the SAME `FormData` to the
 * existing `useActionState` action — confirming records the transaction
 * unchanged, per design.md §5. Income/transfer tabs are unaffected. */
export function TransactionForm({
  accounts,
  categories,
  budgets = [],
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  budgets?: BudgetProgressItem[];
}) {
  const [tab, setTab] = useState<"expense" | "income" | "transfer" | "installment">("expense");
  const [movementState, movementAction, movementPending] = useActionState(recordMovementAction, INITIAL_STATE);
  const [transferState, transferAction, transferPending] = useActionState(recordTransferAction, INITIAL_STATE);
  const [installmentState, installmentAction, installmentPending] = useActionState(
    recordInstallmentPurchaseAction,
    INITIAL_STATE,
  );
  const [, startTransition] = useTransition();
  const creditCardAccounts = accounts.filter((a) => a.type === "credit_card");
  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const [pendingOverBudget, setPendingOverBudget] = useState<{ formData: FormData; impact: BudgetImpact } | null>(
    null,
  );

  const visibleCategories = categories.filter((c) => c.kind === tab);

  function handleMovementSubmit(event: FormEvent<HTMLFormElement>) {
    if (tab !== "expense") return;

    const formData = new FormData(event.currentTarget);
    const categoryId = String(formData.get("categoryId") ?? "");
    const amountCents = pesosToCents(Number(formData.get("amount") ?? 0));
    const budget = budgets.find((b) => b.categoryId === categoryId);

    const impact = evaluateBudgetImpact({
      limitCents: budget?.limitCents ?? null,
      spentCents: budget?.spentCents ?? 0,
      deltaCents: amountCents,
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
    startTransition(() => movementAction(formData));
  }

  function cancelOverBudget() {
    setPendingOverBudget(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {(["expense", "income", "transfer", "installment"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={
              "shrink-0 rounded-pill px-4 py-2 text-sm font-medium transition-colors duration-200 ease-out active:scale-95 " +
              (tab === option
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-accent")
            }
          >
            {option === "expense"
              ? "Gasto"
              : option === "income"
                ? "Ingreso"
                : option === "transfer"
                  ? "Transferencia"
                  : "Compra a meses"}
          </button>
        ))}
      </div>

      {tab !== "transfer" && tab !== "installment" && (
        <form action={movementAction} onSubmit={handleMovementSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="kind" value={tab} />
          <div className="flex flex-col gap-1">
            <label htmlFor="accountId" className="text-sm font-medium">
              Cuenta
            </label>
            <Select name="accountId" defaultValue={accounts[0]?.id}>
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
          <div className="flex flex-col gap-1">
            <label htmlFor="categoryId" className="text-sm font-medium">
              Categoría
            </label>
            {/* keyed on `tab`: visibleCategories changes when the tab flips
                between expense/income, so remounting re-applies defaultValue
                to the new list's first item — matching a native <select>'s
                auto-fallback-to-first-option behavior when its previously
                selected <option> disappears. */}
            <Select key={tab} name="categoryId" defaultValue={visibleCategories[0]?.id}>
              <SelectTrigger id="categoryId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {visibleCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="subtype" className="text-sm font-medium">
              Sub-tipo
            </label>
            {/* keyed on `tab`, same remount idiom as `categoryId` above: switching tabs
                resets the selection to "Sin subtipo" instead of carrying a stale value that
                may not even exist in the new tab's option list (change:
                finance-transaction-subtypes). */}
            <Select key={tab} name="subtype" defaultValue="none">
              <SelectTrigger id="subtype">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin subtipo</SelectItem>
                {SUBTYPE_OPTIONS_BY_TAB[tab].map((o) => (
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
            <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="occurredOn" className="text-sm font-medium">
              Fecha
            </label>
            <DatePicker id="occurredOn" name="occurredOn" defaultValue={today()} required />
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
            <Select name="fromAccountId" defaultValue={accounts[0]?.id}>
              <SelectTrigger id="fromAccountId">
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
            <label htmlFor="toAccountId" className="text-sm font-medium">
              Hacia
            </label>
            <Select name="toAccountId" defaultValue={accounts[1]?.id ?? accounts[0]?.id}>
              <SelectTrigger id="toAccountId">
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
            <label htmlFor="transferSubtype" className="text-sm font-medium">
              Sub-tipo
            </label>
            <Select name="subtype" defaultValue="none">
              <SelectTrigger id="transferSubtype">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin subtipo</SelectItem>
                {SUBTYPE_OPTIONS_BY_TAB.transfer.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <DatePicker id="transferOccurredOn" name="occurredOn" defaultValue={today()} required />
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

      {tab === "installment" && (
        <form action={installmentAction} className="flex flex-col gap-4">
          {creditCardAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Necesitas una cuenta de tipo Tarjeta de crédito para registrar una compra a meses.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="installmentAccountId" className="text-sm font-medium">
                  Tarjeta
                </label>
                <Select name="accountId" defaultValue={creditCardAccounts[0]?.id}>
                  <SelectTrigger id="installmentAccountId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {creditCardAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="installmentCategoryId" className="text-sm font-medium">
                  Categoría
                </label>
                <Select name="categoryId" defaultValue={expenseCategories[0]?.id}>
                  <SelectTrigger id="installmentCategoryId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="installmentAmount" className="text-sm font-medium">
                  Monto total (MXN)
                </label>
                <Input id="installmentAmount" name="amount" type="number" step="0.01" min="0.01" required />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="installmentCount" className="text-sm font-medium">
                  Número de cuotas
                </label>
                <Input
                  id="installmentCount"
                  name="installmentCount"
                  type="number"
                  step="1"
                  min="2"
                  max="60"
                  defaultValue={3}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="installmentOccurredOn" className="text-sm font-medium">
                  Fecha de la primera cuota
                </label>
                <DatePicker id="installmentOccurredOn" name="occurredOn" defaultValue={today()} required />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="installmentDescription" className="text-sm font-medium">
                  Descripción
                </label>
                <Input id="installmentDescription" name="description" maxLength={200} placeholder="Laptop" />
              </div>
              {installmentState.error && <p className="text-sm text-expense">{installmentState.error}</p>}
              <Button type="submit" disabled={installmentPending}>
                {installmentPending ? "Guardando…" : "Registrar compra a meses"}
              </Button>
            </>
          )}
        </form>
      )}

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
