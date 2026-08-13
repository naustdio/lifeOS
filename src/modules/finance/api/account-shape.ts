// Client-safe re-export of the pure account-type domain predicate (design.md §3, change:
// finance-credit-card-payments CC-018/CC-022). Deliberately does NOT import "server-only" —
// unlike `./index.ts`, this file must be importable from a `"use client"` component
// (`AccountForm`) so the card-terms fieldset can decide whether to render without pulling the
// server-only barrel into the client bundle. Still `module-api` under the ESLint boundary
// pattern `src/modules/*/api/**`, so `app` importing it satisfies Gate A. See `./index.ts`'s
// header comment for the full reasoning (established by `finance-budgets`' `budget-evaluation.ts`
// and `finance-recurring`'s `recurring-schedule.ts`).
export { supportsCardDetail, type AccountType } from "../domain/account";

import { deriveAccountClass, type AccountType } from "../domain/account";

/**
 * Per-type detail field labels (Spanish, matching `AccountForm.tsx`'s existing field labels),
 * change: finance-account-edit design.md Decision 2. Used ONLY to build `transitionLoss()`'s
 * discarded-field copy — never sent to the server. The RPC (`finance.update_account`) remains
 * the authority on what is actually deleted; this map only produces user-facing warning text.
 */
export const DETAIL_FIELD_LABELS: Record<string, Record<string, string>> = {
  liability: {
    originalAmountCents: "Monto original",
    interestRateBp: "Tasa de interés",
    termMonths: "Plazo",
    monthlyPaymentCents: "Pago mensual",
    startDate: "Fecha de inicio",
  },
  savings_goal: {
    targetAmountCents: "Monto objetivo",
    targetDate: "Fecha objetivo",
  },
  investment: {
    costBasisCents: "Costo base",
    currentValueCents: "Valor actual",
    valuedOn: "Fecha de valuación",
  },
  loaned: {
    counterpartyName: "¿Quién te debe?",
    originalAmountCents: "Monto original",
    termMonths: "Plazo",
    expectedReturnDate: "Fecha de retorno esperada",
  },
};

/**
 * Which detail fields are discarded when retyping `fromType` -> `toType` (change:
 * finance-account-edit T3.1, design.md Decision 2). Pure/client-side: the edit page already has
 * the account's current type, so this needs no round trip. Returns `[]` when `fromType` has no
 * detail fields, or when `toType` is the SAME type as `fromType` (no-op transition, nothing is
 * discarded) — every other cross-type transition discards `fromType`'s whole detail block,
 * because `finance.update_account()` always deletes the outgoing type's detail row regardless
 * of the incoming type (it never carries a field over).
 */
export function transitionLoss(fromType: AccountType, toType: AccountType): { field: string; label: string }[] {
  if (fromType === toType) return [];
  const labels = DETAIL_FIELD_LABELS[fromType];
  if (!labels) return [];
  return Object.entries(labels).map(([field, label]) => ({ field, label }));
}

/** Whether a retype flips `class` between asset and liability (change: finance-account-edit
 *  T3.1, design.md Decision 3) — drives the separate class-flip confirmation. */
export function flipsClass(fromType: AccountType, toType: AccountType): boolean {
  return deriveAccountClass(fromType) !== deriveAccountClass(toType);
}
