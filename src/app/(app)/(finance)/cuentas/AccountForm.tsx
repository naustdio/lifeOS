"use client";

import { useActionState, useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Input } from "@/design-system/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/design-system/ui/select";
import type { AccountType } from "@/modules/finance/api/account-shape";
import { createAccountAction, type AccountFormState } from "./actions";
import { AccountTypeFields } from "./AccountTypeFields";

const TYPE_LABELS: Record<string, string> = {
  cash: "Efectivo",
  checking: "Cuenta de cheques",
  savings: "Ahorros",
  credit_card: "Tarjeta de crédito",
  liability: "Préstamo / deuda",
  savings_goal: "Meta de ahorro",
  investment: "Inversiones",
  loaned: "Prestado",
};

const INITIAL_STATE: AccountFormState = { error: null };

/** Opening-balance sign constraint per type (design.md §6): debt types
 * (`credit_card`/`liability`) cap at zero-or-negative; `loaned` is the
 * inverse (zero-or-positive, a receivable); every other type is
 * unconstrained. */
function signHintFor(type: string): { max?: number; min?: number; hint: string | null } {
  if (type === "credit_card" || type === "liability") {
    return { max: 0, hint: "Para deuda, el saldo inicial debe ser cero o negativo." };
  }
  if (type === "loaned") {
    return {
      min: 0,
      hint: "Para dinero prestado, el saldo inicial debe ser cero o positivo.",
    };
  }
  return { hint: null };
}

/** Account-creation form (T-036). Conditional fields per `CreateAccountInput`'s
 * discriminated union: `liability` detail block only for `type=liability`,
 * `goal` detail block only for `type=savings_goal`. */
export function AccountForm() {
  const [state, formAction, pending] = useActionState(createAccountAction, INITIAL_STATE);
  const [type, setType] = useState("cash");
  const signHint = signHintFor(type);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          Nombre
        </label>
        <Input id="name" name="name" required maxLength={60} placeholder="Ej. Efectivo" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="type" className="text-sm font-medium">
          Tipo de cuenta
        </label>
        <Select name="type" value={type} onValueChange={setType}>
          <SelectTrigger id="type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="openingBalance" className="text-sm font-medium">
          Saldo inicial (MXN)
        </label>
        <Input
          id="openingBalance"
          name="openingBalance"
          type="number"
          step="0.01"
          defaultValue="0"
          max={signHint.max}
          min={signHint.min}
        />
        {signHint.hint && <p className="text-xs text-muted-foreground">{signHint.hint}</p>}
      </div>

      <AccountTypeFields type={type as AccountType} />

      {state.error && <p className="text-sm text-expense">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
