// Over-budget evaluation — pure preview of the client-side confirmation gate
// (design.md §4, §6 Decision 3): no Supabase import, no I/O.

export type BudgetImpact = {
  budgeted: boolean;
  limitCents: number | null;
  projectedSpentCents: number;
  crossesLimit: boolean;
};

/**
 * Pure over-budget evaluation. `spentCents` is the view's current-month spend (which ALREADY
 * includes the transaction being edited, when editing in the same category); `deltaCents` is the
 * signed change this submission makes to that spend.
 * Confirmation is warranted only when the submission INCREASES spend and the projection meets or
 * exceeds the limit (spec: "would meet or exceed" -> `>=`). A delta of zero or less never prompts,
 * so lowering an already-over-budget amount is not punished with a dialog.
 */
export function evaluateBudgetImpact(input: {
  limitCents: number | null;
  spentCents: number;
  deltaCents: number;
}): BudgetImpact {
  const { limitCents, spentCents, deltaCents } = input;
  const projectedSpentCents = spentCents + deltaCents;

  if (limitCents === null || deltaCents <= 0) {
    return { budgeted: limitCents !== null, limitCents, projectedSpentCents, crossesLimit: false };
  }

  return {
    budgeted: true,
    limitCents,
    projectedSpentCents,
    crossesLimit: projectedSpentCents >= limitCents,
  };
}

/**
 * Resolves which category to check and by how much, for an edit.
 *
 * | Case | Category checked | deltaCents |
 * |---|---|---|
 * | Edit, same category | that category | next − previous |
 * | Edit, category changed | the new category | +next |
 *
 * The old category is never checked on a move: its spend only decreases, and a decrease cannot
 * cross a limit.
 */
export function budgetDeltaForEdit(input: {
  previousCategoryId: string | null;
  previousAmountCents: number;
  nextCategoryId: string | null;
  nextAmountCents: number;
}): { categoryId: string | null; deltaCents: number } {
  const { previousCategoryId, previousAmountCents, nextCategoryId, nextAmountCents } = input;

  if (previousCategoryId === nextCategoryId) {
    return { categoryId: nextCategoryId, deltaCents: nextAmountCents - previousAmountCents };
  }

  return { categoryId: nextCategoryId, deltaCents: nextAmountCents };
}
