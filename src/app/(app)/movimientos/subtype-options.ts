import type { TransactionSubtypeKey } from "@/design-system/tokens/transaction-subtype-style";

/**
 * Spanish labels + per-tab/per-type sub-type option lists (design.md §"Key Decisions" #5, change:
 * finance-transaction-subtypes). Labels live here, not in the icon-only registry, mirroring how
 * app pages already own their Spanish maps (`TYPE_LABEL` in `movimientos/page.tsx`).
 * `compra_meses` is reserved (design.md Decision 6) and MUST NOT appear in any list below.
 */

export type SubtypeOption = { key: TransactionSubtypeKey; label: string };

export const SUBTYPE_OPTIONS_BY_TAB: Record<"expense" | "income" | "transfer", SubtypeOption[]> = {
  expense: [{ key: "pago", label: "Pago" }],
  income: [
    { key: "reembolso", label: "Reembolso" },
    { key: "devolucion_efectivo", label: "Devolución en efectivo" },
  ],
  transfer: [{ key: "pago_tarjeta", label: "Pago de tarjeta" }],
};

/** Same mapping keyed on a stored transaction's `type` (used by the edit form). */
export function subtypeOptionsForType(type: "income" | "expense" | "transfer"): SubtypeOption[] {
  return SUBTYPE_OPTIONS_BY_TAB[type];
}
