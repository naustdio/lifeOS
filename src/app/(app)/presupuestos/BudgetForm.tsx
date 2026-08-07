"use client";

import { Target } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { ProgressBar } from "@/design-system/patterns/ProgressBar";
import { Button } from "@/design-system/ui/button";
import { Input } from "@/design-system/ui/input";
import { formatCentsAsMXN } from "@/shared/money";
import type { BudgetProgressItem } from "@/modules/finance/api/budget-evaluation";
import { removeBudgetAction, setBudgetLimitAction, type BudgetFormState } from "./actions";

type CategoryOption = { id: string; name: string; parentId: string | null };

const INITIAL_STATE: BudgetFormState = { error: null };

/**
 * One row per active expense category (B-005), grouped by parent category (Phase: budget
 * grouping) — a top-level category with children renders as a group header (name + the group's
 * total budgeted spend) followed by its children's rows; a top-level category with no children
 * renders directly as its own row, same as before this change. Opt-in limit input for an
 * unbudgeted category, or a progress bar + "quitar presupuesto" for a budgeted one.
 */
export function BudgetForm({
  categories,
  budgets,
}: {
  categories: CategoryOption[];
  budgets: BudgetProgressItem[];
}) {
  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, b]));
  const topLevel = categories.filter((c) => c.parentId === null);
  const childrenOf = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  return (
    <div className="flex flex-col gap-6">
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
      {topLevel.map((category) => {
        const children = childrenOf(category.id);
        if (children.length === 0) {
          return (
            <BudgetRow key={category.id} category={category} budget={budgetByCategory.get(category.id) ?? null} />
          );
        }

        const groupSpentCents = children.reduce((sum, c) => sum + (budgetByCategory.get(c.id)?.spentCents ?? 0), 0);

        return (
          <div key={category.id} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {category.name}
              </span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                {formatCentsAsMXN(groupSpentCents)}
              </span>
            </div>
            <div className="flex flex-col gap-4 rounded-card border border-border p-3">
              {children.map((child) => (
                <BudgetRow key={child.id} category={child} budget={budgetByCategory.get(child.id) ?? null} />
              ))}
            </div>
          </div>
        );
      })}
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
