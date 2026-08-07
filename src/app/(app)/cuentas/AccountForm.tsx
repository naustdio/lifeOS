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
import { supportsCardDetail, type AccountType } from "@/modules/finance/api/account-shape";
import { createAccountAction, type AccountFormState } from "./actions";

const DAYS_1_TO_31 = Array.from({ length: 31 }, (_, i) => String(i + 1));

const TYPE_LABELS: Record<string, string> = {
  cash: "Efectivo",
  checking: "Cuenta de cheques",
  savings: "Ahorros",
  credit_card: "Tarjeta de crédito",
  liability: "Préstamo / deuda",
  savings_goal: "Meta de ahorro",
};

const INITIAL_STATE: AccountFormState = { error: null };

/** Account-creation form (T-036). Conditional fields per `CreateAccountInput`'s
 * discriminated union: `liability` detail block only for `type=liability`,
 * `goal` detail block only for `type=savings_goal`. */
export function AccountForm() {
  const [state, formAction, pending] = useActionState(createAccountAction, INITIAL_STATE);
  const [type, setType] = useState("cash");

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
          max={type === "credit_card" || type === "liability" ? 0 : undefined}
        />
        {(type === "credit_card" || type === "liability") && (
          <p className="text-xs text-muted-foreground">
            Para deuda, el saldo inicial debe ser cero o negativo.
          </p>
        )}
      </div>

      {type === "liability" && (
        <fieldset className="flex flex-col gap-3 rounded-card border border-border p-4">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Datos del préstamo</legend>
          <div className="flex flex-col gap-1">
            <label htmlFor="originalAmount" className="text-sm">
              Monto original (MXN)
            </label>
            <Input id="originalAmount" name="originalAmount" type="number" step="0.01" required />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="interestRateBp" className="text-sm">
              Tasa de interés (puntos base)
            </label>
            <Input id="interestRateBp" name="interestRateBp" type="number" min={0} required />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="termMonths" className="text-sm">
              Plazo (meses)
            </label>
            <Input id="termMonths" name="termMonths" type="number" min={1} required />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="monthlyPayment" className="text-sm">
              Pago mensual (MXN)
            </label>
            <Input id="monthlyPayment" name="monthlyPayment" type="number" step="0.01" required />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="startDate" className="text-sm">
              Fecha de inicio
            </label>
            <Input id="startDate" name="startDate" type="date" required />
          </div>
        </fieldset>
      )}

      {supportsCardDetail(type as AccountType) && (
        <fieldset className="flex flex-col gap-3 rounded-card border border-border p-4">
          <legend className="px-1 text-xs font-medium text-muted-foreground">
            Términos de la tarjeta (opcional)
          </legend>
          <div className="flex flex-col gap-1">
            <label htmlFor="creditLimitCents" className="text-sm">
              Límite de crédito (MXN)
            </label>
            <Input id="creditLimitCents" name="creditLimitCents" type="number" step="0.01" min="0.01" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="statementDay" className="text-sm">
              Día de corte
            </label>
            <Select name="statementDay">
              <SelectTrigger id="statementDay">
                <SelectValue placeholder="Sin definir" />
              </SelectTrigger>
              <SelectContent>
                {DAYS_1_TO_31.map((day) => (
                  <SelectItem key={day} value={day}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="dueDay" className="text-sm">
              Día de pago
            </label>
            <Select name="dueDay">
              <SelectTrigger id="dueDay">
                <SelectValue placeholder="Sin definir" />
              </SelectTrigger>
              <SelectContent>
                {DAYS_1_TO_31.map((day) => (
                  <SelectItem key={day} value={day}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="minPaymentCents" className="text-sm">
              Pago mínimo (MXN)
            </label>
            <Input id="minPaymentCents" name="minPaymentCents" type="number" step="0.01" min="0.01" />
          </div>
        </fieldset>
      )}

      {type === "savings_goal" && (
        <fieldset className="flex flex-col gap-3 rounded-card border border-border p-4">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Meta de ahorro</legend>
          <div className="flex flex-col gap-1">
            <label htmlFor="targetAmount" className="text-sm">
              Monto objetivo (MXN)
            </label>
            <Input id="targetAmount" name="targetAmount" type="number" step="0.01" required />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="targetDate" className="text-sm">
              Fecha objetivo (opcional)
            </label>
            <Input id="targetDate" name="targetDate" type="date" />
          </div>
        </fieldset>
      )}

      {state.error && <p className="text-sm text-expense">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
