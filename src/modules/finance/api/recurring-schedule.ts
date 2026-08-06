// Client-safe re-export of the pure recurring date arithmetic (finance-recurring R-010).
// Deliberately does NOT import "server-only" — unlike `./index.ts`, this file must be
// importable from a `"use client"` component (`RecurringRow`, `RecurringList`,
// `ConfirmRecurringSheet`, `RecurringForm`) for due/overdue display and the frequency picker.
// Still `module-api` under the ESLint boundary pattern `src/modules/*/api/**`, so `app`
// importing it satisfies Gate A. See `./index.ts`'s header comment for the full reasoning
// (established by `finance-budgets`' `budget-evaluation.ts`).
export { nextDueDate, daysOverdue, nextFutureDueDate, type Frequency } from "../domain/recurring";
export type { RecurringListItem, DueRecurringItem } from "../data/recurring-repository";
