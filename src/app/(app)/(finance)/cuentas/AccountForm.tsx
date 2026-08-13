"use client";

import { useSearchParams } from "next/navigation";
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
  checking: "Tarjeta de débito",
  savings: "Ahorros",
  credit_card: "Tarjeta de crédito",
  liability: "Préstamo / deuda",
  savings_goal: "Meta de ahorro",
  investment: "Inversiones",
  loaned: "Prestado",
};

const INITIAL_STATE: AccountFormState = { error: null };

/** Opening-balance sign convention per type (design.md §6): debt types (`credit_card`/
 * `liability`) are stored zero-or-negative internally, `loaned` zero-or-positive, every other
 * type unconstrained. Debt types ask the user for a plain positive "how much do you owe"
 * amount instead — negating it themselves felt backwards (T-036 fast-follow) — and the form
 * negates it before submit so the stored/displayed convention is unchanged everywhere else. */
function isDebtType(type: string): boolean {
  return type === "credit_card" || type === "liability";
}

function balanceFieldCopy(type: string): { label: string; hint: string | null; min?: number } {
  if (isDebtType(type)) {
    return { label: "¿Cuánto debes actualmente? (MXN)", hint: "Se registra como deuda.", min: 0 };
  }
  if (type === "loaned") {
    return {
      label: "Saldo inicial (MXN)",
      hint: "Para dinero prestado, el saldo inicial debe ser cero o positivo.",
      min: 0,
    };
  }
  return { label: "Saldo inicial (MXN)", hint: null };
}

/** Account-creation form (T-036). Conditional fields per `CreateAccountInput`'s
 * discriminated union: `liability` detail block only for `type=liability`,
 * `goal` detail block only for `type=savings_goal`. */
export function AccountForm() {
  const searchParams = useSearchParams();
  const requestedType = searchParams.get("type");
  const [state, formAction, pending] = useActionState(createAccountAction, INITIAL_STATE);
  const [type, setType] = useState(requestedType && requestedType in TYPE_LABELS ? requestedType : "cash");
  const [balanceInput, setBalanceInput] = useState("0");
  const balanceCopy = balanceFieldCopy(type);
  const enteredBalance = Number(balanceInput) || 0;
  const signedBalance = isDebtType(type) ? -Math.abs(enteredBalance) : enteredBalance;

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
          {balanceCopy.label}
        </label>
        <Input
          id="openingBalance"
          type="number"
          step="0.01"
          min={balanceCopy.min}
          value={balanceInput}
          onChange={(event) => setBalanceInput(event.target.value)}
        />
        {/* The visible input above always takes a plain, unsigned magnitude — this hidden
            field carries the actual signed value `createAccountAction` reads (design.md §6's
            stored convention: debt types are zero-or-negative). */}
        <input type="hidden" name="openingBalance" value={signedBalance} />
        {balanceCopy.hint && <p className="text-xs text-muted-foreground">{balanceCopy.hint}</p>}
      </div>

      <AccountTypeFields type={type as AccountType} />

      {state.error && <p className="text-sm text-expense">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
