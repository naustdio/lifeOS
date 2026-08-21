// Pure portion-scaling + cost-summing helpers (design.md "Combining algorithm" section).
// `scaleQuantity` is verbatim the same ratio formula already established at
// `src/app/(app)/(recipes)/recetas/[id]/RecipeDetail.tsx:206`. Zero Supabase/framework imports.

/** `quantity * (targetPortions / basePortions)`, with the same `basePortions > 0 ? … : 1` guard
 *  RecipeDetail.tsx already uses so a zero/negative base never divides by zero. Null quantity
 *  ("al gusto") passes through unchanged. */
export function scaleQuantity(quantity: number | null, targetPortions: number, basePortions: number): number | null {
  if (quantity === null) return null;
  const ratio = basePortions > 0 ? targetPortions / basePortions : 1;
  return quantity * ratio;
}

/** Sum of `quantity * estimatedUnitCost` over priced items only; unpriced items are excluded
 *  without error (spec `shopping-list-continuous` "Estimated Total Cost"). Returns 0, not null,
 *  when nothing is priced — this feeds a `numeric` column, not a display placeholder. */
export function estimatedTotal(items: readonly { quantity: number | null; estimatedUnitCost: number | null }[]): number {
  return items.reduce((sum, item) => {
    if (item.quantity === null || item.estimatedUnitCost === null) return sum;
    return sum + item.quantity * item.estimatedUnitCost;
  }, 0);
}
