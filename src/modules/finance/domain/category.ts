// Category depth/kind validation — pure preview of the BEFORE INSERT/UPDATE trigger
// (design.md §3.4): max one level deep, child shares `kind` with its parent.

export type CategoryKind = "income" | "expense";

export type CategoryNode = {
  id: string;
  kind: CategoryKind;
  parentId: string | null;
};

/**
 * Validates a candidate child against its resolved parent (or `null` for a top-level
 * category). Returns a validation error message, or `null` when the shape is legal.
 */
export function validateCategoryShape(
  candidate: { kind: CategoryKind; parentId: string | null },
  parent: CategoryNode | null,
): string | null {
  if (candidate.parentId === null) {
    return null; // top-level category, always legal
  }
  if (parent === null) {
    return "parent category not found";
  }
  if (parent.parentId !== null) {
    return "categories may only be nested one level deep";
  }
  if (parent.kind !== candidate.kind) {
    return "child category must share kind with its parent";
  }
  return null;
}
