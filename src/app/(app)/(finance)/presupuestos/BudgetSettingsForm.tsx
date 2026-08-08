"use client";

import { useActionState, useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { Input } from "@/design-system/ui/input";
import { saveBudgetSettingsAction, type BudgetFormState } from "./actions";

const INITIAL_STATE: BudgetFormState = { error: null };

export type BudgetSettingsFormProps = {
  resetDay: number;
  monthlyTotalCents: number | null;
  includeScheduledAsSpent: boolean;
  /** Sum of every per-category limit currently configured — used only to show the "presupuesto
   *  mensual total asignado" checkmark when it matches the configured total exactly. */
  sumOfCategoryLimitsCents: number;
};

/**
 * Settings panel above the per-category budget list: period reset day, an overall monthly total
 * budget (separate from per-category limits, opt-in), and whether not-yet-posted recurring
 * expenses count toward "spent" for the period. All three are wired to real DB-side behavior
 * (`finance.budget_period_bounds()`/`budget_progress`/`budget_total_progress`), not display-only.
 */
export function BudgetSettingsForm({
  resetDay,
  monthlyTotalCents,
  includeScheduledAsSpent,
  sumOfCategoryLimitsCents,
}: BudgetSettingsFormProps) {
  const [state, action, pending] = useActionState(saveBudgetSettingsAction, INITIAL_STATE);
  const [totalEnabled, setTotalEnabled] = useState(monthlyTotalCents !== null);

  const totalMatchesCategorySum =
    totalEnabled && monthlyTotalCents !== null && monthlyTotalCents === sumOfCategoryLimitsCents;

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-6">
        <form action={action} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="resetDay" className="text-sm font-medium">
              Día de reinicio del periodo
            </label>
            <p className="text-xs text-muted-foreground">Selecciona el día del mes en que comienza tu presupuesto.</p>
            <Input
              id="resetDay"
              name="resetDay"
              type="number"
              min="1"
              max="31"
              step="1"
              defaultValue={resetDay}
              className="w-24"
            />
          </div>

          <div className="flex items-start justify-between gap-3 border-t border-border pt-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="includeScheduledAsSpent" className="text-sm font-medium">
                Incluir trans. programadas en cálculo de gastado
              </label>
              <p className="text-xs text-muted-foreground">
                Cuenta las transacciones programadas como si ya se hubieran gastado, para mostrar un
                presupuesto restante más preciso.
              </p>
            </div>
            <input
              id="includeScheduledAsSpent"
              name="includeScheduledAsSpent"
              type="checkbox"
              defaultChecked={includeScheduledAsSpent}
              className="mt-1 h-5 w-9 shrink-0 accent-primary"
            />
          </div>

          <div className="flex items-start justify-between gap-3 border-t border-border pt-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="monthlyTotalEnabled" className="text-sm font-medium">
                Presupuesto Mensual
              </label>
              <p className="text-xs text-muted-foreground">Establece una cantidad total que deseas gastar cada mes.</p>
            </div>
            <input
              id="monthlyTotalEnabled"
              name="monthlyTotalEnabled"
              type="checkbox"
              checked={totalEnabled}
              onChange={(e) => setTotalEnabled(e.target.checked)}
              className="mt-1 h-5 w-9 shrink-0 accent-primary"
            />
          </div>

          {totalEnabled && (
            <div className="flex flex-col gap-2">
              <Input
                name="monthlyTotal"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={monthlyTotalCents !== null ? monthlyTotalCents / 100 : undefined}
                aria-label="Presupuesto mensual total (MXN)"
                placeholder="$0"
              />
              {totalMatchesCategorySum && (
                <p className="flex items-center gap-1 text-xs text-income">
                  ✓ Presupuesto mensual total asignado
                </p>
              )}
            </div>
          )}

          {state.error && <p className="text-sm text-expense">{state.error}</p>}
          <Button type="submit" size="sm" disabled={pending} className="self-start">
            {pending ? "Guardando…" : "Guardar configuración"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
