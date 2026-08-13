"use client";

import { DatePicker } from "@/design-system/patterns/DatePicker";
import { Input } from "@/design-system/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/design-system/ui/select";
import { supportsCardDetail, type AccountType } from "@/modules/finance/api/account-shape";

const DAYS_1_TO_31 = Array.from({ length: 31 }, (_, i) => String(i + 1));

export type AccountTypeFieldDefaults = {
  liability?: {
    originalAmountCents?: number;
    interestRateBp?: number;
    termMonths?: number;
    monthlyPaymentCents?: number;
    startDate?: string;
  };
  card?: {
    creditLimitCents?: number | null;
    statementDay?: number | null;
    dueDay?: number | null;
    minPaymentCents?: number | null;
  };
  goal?: { targetAmountCents?: number; targetDate?: string | null };
  investment?: { costBasisCents?: number; currentValueCents?: number; valuedOn?: string };
  loaned?: {
    counterpartyName?: string;
    originalAmountCents?: number;
    termMonths?: number | null;
    expectedReturnDate?: string | null;
  };
};

function centsToPesosInput(cents: number | null | undefined): string | undefined {
  if (cents === null || cents === undefined) return undefined;
  return (cents / 100).toString();
}

/**
 * Per-account-type fieldsets, extracted verbatim from the create flow's inline JSX (change:
 * finance-account-edit T3.3, design.md "File Changes") so `AccountForm.tsx` (create) and
 * `EditAccountForm.tsx` (edit) render byte-identical fieldsets. `defaults` prefill the inputs
 * for the edit flow; the create flow renders this with no `defaults` (every field starts
 * empty). The opening-balance input is deliberately NOT here — it stays only in the create
 * form (design.md's "File Changes" table; balance editing is out of scope for this change).
 */
export function AccountTypeFields({
  type,
  defaults,
}: {
  type: AccountType;
  defaults?: AccountTypeFieldDefaults;
}) {
  return (
    <>
      {type === "liability" && (
        <fieldset className="flex flex-col gap-3 rounded-card border border-border p-4">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Datos del préstamo</legend>
          <div className="flex flex-col gap-1">
            <label htmlFor="originalAmount" className="text-sm">
              Monto original (MXN)
            </label>
            <Input
              id="originalAmount"
              name="originalAmount"
              type="number"
              step="0.01"
              required
              defaultValue={centsToPesosInput(defaults?.liability?.originalAmountCents)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="interestRateBp" className="text-sm">
              Tasa de interés (puntos base)
            </label>
            <Input
              id="interestRateBp"
              name="interestRateBp"
              type="number"
              min={0}
              required
              defaultValue={defaults?.liability?.interestRateBp}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="termMonths" className="text-sm">
              Plazo (meses)
            </label>
            <Input
              id="termMonths"
              name="termMonths"
              type="number"
              min={1}
              required
              defaultValue={defaults?.liability?.termMonths}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="monthlyPayment" className="text-sm">
              Pago mensual (MXN)
            </label>
            <Input
              id="monthlyPayment"
              name="monthlyPayment"
              type="number"
              step="0.01"
              required
              defaultValue={centsToPesosInput(defaults?.liability?.monthlyPaymentCents)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="startDate" className="text-sm">
              Fecha de inicio
            </label>
            <DatePicker id="startDate" name="startDate" required defaultValue={defaults?.liability?.startDate} />
          </div>
        </fieldset>
      )}

      {supportsCardDetail(type) && (
        <fieldset className="flex flex-col gap-3 rounded-card border border-border p-4">
          <legend className="px-1 text-xs font-medium text-muted-foreground">
            Términos de la tarjeta (opcional)
          </legend>
          <div className="flex flex-col gap-1">
            <label htmlFor="creditLimitCents" className="text-sm">
              Límite de crédito (MXN)
            </label>
            <Input
              id="creditLimitCents"
              name="creditLimitCents"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={centsToPesosInput(defaults?.card?.creditLimitCents)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="statementDay" className="text-sm">
              Día de corte
            </label>
            <Select name="statementDay" defaultValue={defaults?.card?.statementDay ? String(defaults.card.statementDay) : undefined}>
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
            <Select name="dueDay" defaultValue={defaults?.card?.dueDay ? String(defaults.card.dueDay) : undefined}>
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
            <Input
              id="minPaymentCents"
              name="minPaymentCents"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={centsToPesosInput(defaults?.card?.minPaymentCents)}
            />
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
            <Input
              id="targetAmount"
              name="targetAmount"
              type="number"
              step="0.01"
              required
              defaultValue={centsToPesosInput(defaults?.goal?.targetAmountCents)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="targetDate" className="text-sm">
              Fecha objetivo (opcional)
            </label>
            <DatePicker id="targetDate" name="targetDate" defaultValue={defaults?.goal?.targetDate ?? undefined} />
          </div>
        </fieldset>
      )}

      {type === "investment" && (
        <fieldset className="flex flex-col gap-3 rounded-card border border-border p-4">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Inversión</legend>
          <div className="flex flex-col gap-1">
            <label htmlFor="costBasis" className="text-sm">
              Costo base (MXN)
            </label>
            <Input
              id="costBasis"
              name="costBasis"
              type="number"
              step="0.01"
              required
              defaultValue={centsToPesosInput(defaults?.investment?.costBasisCents)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="currentValue" className="text-sm">
              Valor actual (MXN, opcional)
            </label>
            <Input
              id="currentValue"
              name="currentValue"
              type="number"
              step="0.01"
              defaultValue={centsToPesosInput(defaults?.investment?.currentValueCents)}
            />
            <p className="text-xs text-muted-foreground">
              Valor actual, capturado por ti — la app no consulta precios de mercado.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="valuedOn" className="text-sm">
              Fecha de valuación (opcional)
            </label>
            <DatePicker id="valuedOn" name="valuedOn" defaultValue={defaults?.investment?.valuedOn} />
          </div>
        </fieldset>
      )}

      {type === "loaned" && (
        <fieldset className="flex flex-col gap-3 rounded-card border border-border p-4">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Datos del préstamo</legend>
          <div className="flex flex-col gap-1">
            <label htmlFor="counterpartyName" className="text-sm">
              ¿Quién te debe?
            </label>
            <Input
              id="counterpartyName"
              name="counterpartyName"
              required
              maxLength={60}
              placeholder="¿Quién te debe?"
              defaultValue={defaults?.loaned?.counterpartyName}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="originalAmount" className="text-sm">
              Monto original (MXN)
            </label>
            <Input
              id="originalAmount"
              name="originalAmount"
              type="number"
              step="0.01"
              required
              defaultValue={centsToPesosInput(defaults?.loaned?.originalAmountCents)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="termMonths" className="text-sm">
              Plazo (meses, opcional)
            </label>
            <Input
              id="termMonths"
              name="termMonths"
              type="number"
              min={1}
              defaultValue={defaults?.loaned?.termMonths ?? undefined}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="expectedReturnDate" className="text-sm">
              Fecha de retorno esperada (opcional)
            </label>
            <DatePicker id="expectedReturnDate" name="expectedReturnDate" defaultValue={defaults?.loaned?.expectedReturnDate ?? undefined} />
          </div>
        </fieldset>
      )}
    </>
  );
}
