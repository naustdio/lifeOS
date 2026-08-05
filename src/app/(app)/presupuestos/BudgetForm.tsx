"use client";

import { Target } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { ProgressBar } from "@/design-system/patterns/ProgressBar";
import { Button } from "@/design-system/ui/button";
import { Input } from "@/design-system/ui/input";
import type { BudgetProgressItem } from "@/modules/finance/api/budget-evaluation";
import { removeBudgetAction, setBudgetLimitAction, type BudgetFormState } from "./actions";

type CategoryOption = { id: string; name: string };

const INITIAL_STATE: BudgetFormState = { error: null };

/**
 * One row per active expense category (B-005): opt-in limit input for an
 * unbudgeted category, or a progress bar + "quitar presupuesto" for a
 * budgeted one. Single-column layout, usable at 375px, light and dark, no
 * raw hex (existing semantic tokens only).
 */
export function BudgetForm({
  categories,
  budgets,
}: {
  categories: CategoryOption[];
  budgets: BudgetProgressItem[];
}) {
  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, b]));

  return (
    <div className="flex flex-col gap-4">
      {categories.length === 0 && (
        <EmptyState
          icon={Target}
          heading="Aún no hay categorías de gasto"
          description="Registra un gasto en Movimientos para crear categorías."
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/movimientos">Ir a movimientos</Link>
            </Button>
          }
        />
      )}
      {categories.map((category) => (
        <BudgetRow
          key={category.id}
          category={category}
          budget={budgetByCategory.get(category.id) ?? null}
        />
      ))}
    </div>
  );
}

function BudgetRow({
  category,
  budget,
}: {
  category: CategoryOption;
  budget: BudgetProgressItem | null;
}) {
  const [setState, setAction, setPending] = useActionState(setBudgetLimitAction, INITIAL_STATE);
  const [removeState, removeAction, removePending] = useActionState(removeBudgetAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <span className="text-sm font-medium">{category.name}</span>

      {budget ? (
        <>
          <ProgressBar valueCents={budget.spentCents} limitCents={budget.limitCents} />
          <form action={removeAction}>
            <input type="hidden" name="categoryId" value={category.id} />
            {removeState.error && <p className="text-xs text-expense">{removeState.error}</p>}
            <Button type="submit" variant="ghost" size="sm" disabled={removePending}>
              {removePending ? "Quitando…" : "Quitar presupuesto"}
            </Button>
          </form>
        </>
      ) : (
        <form action={setAction} className="flex items-center gap-2">
          <input type="hidden" name="categoryId" value={category.id} />
          <Input
            name="limit"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Límite (MXN)"
            required
            aria-label={`Límite para ${category.name}`}
          />
          <Button type="submit" size="sm" disabled={setPending}>
            {setPending ? "Guardando…" : "Activar"}
          </Button>
        </form>
      )}
      {setState.error && <p className="text-xs text-expense">{setState.error}</p>}
    </div>
  );
}
