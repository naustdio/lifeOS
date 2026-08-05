// Client-safe re-export of the pure budget evaluation functions (finance-budgets B-007/B-008).
// Deliberately does NOT import "server-only" — unlike `./index.ts`, this file must be
// importable from a `"use client"` component (`TransactionForm`, `EditTransactionForm`) for the
// pre-submit over-budget gate. Still `module-api` under the ESLint boundary pattern
// `src/modules/*/api/**`, so `app` importing it satisfies Gate A. See `./index.ts`'s header
// comment for the full reasoning.
export { evaluateBudgetImpact, budgetDeltaForEdit, type BudgetImpact } from "../domain/budget";
export type { BudgetProgressItem } from "../data/budget-repository";
