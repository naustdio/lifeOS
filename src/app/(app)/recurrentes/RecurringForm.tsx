"use client";

import { useActionState, useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { DatePicker } from "@/design-system/patterns/DatePicker";
import { Input } from "@/design-system/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-system/ui/select";
import { saveRecurringAction, type RecurringFormState } from "./actions";

type AccountOption = { id: string; name: string; class?: "asset" | "liability" };
type CategoryOption = { id: string; name: string };

const INITIAL_STATE: RecurringFormState = { error: null };
const today = () => new Date().toISOString().slice(0, 10);

const FREQUENCIES = [
  { value: "monthly", label: "Mensual" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quincenal" },
  { value: "yearly", label: "Anual" },
] as const;

const TYPES = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" },
  { value: "transfer", label: "Pago de tarjeta" },
] as const;

/**
 * Create/edit recurring definition form (design.md §9/§4, change: finance-recurring R-016,
 * finance-credit-card-payments CC-026). Account, category, frequency, and (new) type/destination
 * all use the design-system `Select` — never a raw `<select>` (standing `finance-ui-polish`
 * convention). `Tipo = "Pago de tarjeta"` swaps Categoría for Tarjeta destino (options filtered
 * to `class = "liability"`, excluding the selected source account — design.md §4) and relabels
 * Cuenta as "Cuenta origen". The amount is a FIXED, user-configured value per occurrence — never
 * read from the destination card's live balance (design.md's core auto-pay decision).
 */
export function RecurringForm({
  accounts,
  categories,
  incomeCategories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  incomeCategories: CategoryOption[];
}) {
  const [state, action, pending] = useActionState(saveRecurringAction, INITIAL_STATE);
  const [type, setType] = useState<"expense" | "income" | "transfer">("expense");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");

  const destinationOptions = accounts.filter((a) => a.class === "liability" && a.id !== accountId);
  const categoryOptionsForType = type === "income" ? incomeCategories : categories;

  return (
    <Card id="recurring-form">
      <CardHeader>
        <CardTitle>Nueva recurrente</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="recurringType" className="text-sm font-medium">
              Tipo
            </label>
            <Select
              name="type"
              value={type}
              onValueChange={(v) => setType(v as "expense" | "income" | "transfer")}
            >
              <SelectTrigger id="recurringType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="recurringAccountId" className="text-sm font-medium">
              {type === "transfer" ? "Cuenta origen" : "Cuenta"}
            </label>
            <Select name="accountId" value={accountId} onValueChange={setAccountId}>
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
          {type === "transfer" ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="recurringToAccountId" className="text-sm font-medium">
                Tarjeta destino
              </label>
              <Select name="toAccountId" defaultValue={destinationOptions[0]?.id}>
                <SelectTrigger id="recurringToAccountId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {destinationOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label htmlFor="recurringCategoryId" className="text-sm font-medium">
                Categoría
              </label>
              <Select key={type} name="categoryId" defaultValue={categoryOptionsForType[0]?.id}>
                <SelectTrigger id="recurringCategoryId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptionsForType.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
            {type === "transfer" && (
              <p className="text-xs text-muted-foreground">
                Monto fijo por ocurrencia — no se calcula del saldo actual de la tarjeta.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="recurringNextDueDate" className="text-sm font-medium">
              Primera fecha de vencimiento
            </label>
            <DatePicker id="recurringNextDueDate" name="nextDueDate" defaultValue={today()} required />
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
