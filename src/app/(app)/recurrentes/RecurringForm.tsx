"use client";

import { useActionState } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { Input } from "@/design-system/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-system/ui/select";
import { saveRecurringAction, type RecurringFormState } from "./actions";

type AccountOption = { id: string; name: string };
type CategoryOption = { id: string; name: string };

const INITIAL_STATE: RecurringFormState = { error: null };
const today = () => new Date().toISOString().slice(0, 10);

const FREQUENCIES = [
  { value: "monthly", label: "Mensual" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quincenal" },
  { value: "yearly", label: "Anual" },
] as const;

/**
 * Create/edit recurring expense form (design.md §9, change: finance-recurring R-016). Account,
 * category, and frequency all use the design-system `Select` — never a raw `<select>` (standing
 * `finance-ui-polish` convention).
 */
export function RecurringForm({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const [state, action, pending] = useActionState(saveRecurringAction, INITIAL_STATE);

  return (
    <Card id="recurring-form">
      <CardHeader>
        <CardTitle>Nueva recurrente</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="recurringAccountId" className="text-sm font-medium">
              Cuenta
            </label>
            <Select name="accountId" defaultValue={accounts[0]?.id}>
              <SelectTrigger id="recurringAccountId">
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
            <label htmlFor="recurringCategoryId" className="text-sm font-medium">
              Categoría
            </label>
            <Select name="categoryId" defaultValue={categories[0]?.id}>
              <SelectTrigger id="recurringCategoryId">
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
          <div className="flex flex-col gap-1">
            <label htmlFor="recurringFrequency" className="text-sm font-medium">
              Frecuencia
            </label>
            <Select name="frequency" defaultValue="monthly">
              <SelectTrigger id="recurringFrequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="recurringAmount" className="text-sm font-medium">
              Monto (MXN)
            </label>
            <Input id="recurringAmount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="recurringNextDueDate" className="text-sm font-medium">
              Primera fecha de vencimiento
            </label>
            <Input id="recurringNextDueDate" name="nextDueDate" type="date" defaultValue={today()} required />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="recurringDescription" className="text-sm font-medium">
              Descripción
            </label>
            <Input id="recurringDescription" name="description" maxLength={200} />
          </div>
          {state.error && <p className="text-sm text-expense">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Crear recurrente"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
