// Client-safe re-export of the pure account-type domain predicate (design.md §3, change:
// finance-credit-card-payments CC-018/CC-022). Deliberately does NOT import "server-only" —
// unlike `./index.ts`, this file must be importable from a `"use client"` component
// (`AccountForm`) so the card-terms fieldset can decide whether to render without pulling the
// server-only barrel into the client bundle. Still `module-api` under the ESLint boundary
// pattern `src/modules/*/api/**`, so `app` importing it satisfies Gate A. See `./index.ts`'s
// header comment for the full reasoning (established by `finance-budgets`' `budget-evaluation.ts`
// and `finance-recurring`'s `recurring-schedule.ts`).
export { supportsCardDetail, type AccountType } from "../domain/account";
