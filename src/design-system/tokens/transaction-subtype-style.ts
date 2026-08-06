import { CalendarClock, CreditCard, HandCoins, type LucideIcon, Receipt, Undo2 } from "lucide-react";

/**
 * Icon-only registry for transaction sub-type styling (design.md §4, change:
 * finance-transaction-subtypes). Explicit named Lucide imports only (no dynamic import). No
 * color map — a sub-type icon layers onto an already-colored category chip or transaction row
 * (`category-style.ts` owns color). Key list MUST stay in lockstep with the CHECK constraint in
 * supabase/migrations/20260804090018_finance_transaction_subtypes.sql — the registry/database
 * parity test in tests/unit/transaction-subtype-registry.test.ts enforces this.
 */

export const TRANSACTION_SUBTYPE_ICONS = {
  pago: Receipt,
  reembolso: Undo2,
  devolucion_efectivo: HandCoins,
  pago_tarjeta: CreditCard,
  compra_meses: CalendarClock, // reserved: rendered if present, never producible from this UI
} as const satisfies Record<string, LucideIcon>;

export type TransactionSubtypeKey = keyof typeof TRANSACTION_SUBTYPE_ICONS;

function isTransactionSubtypeKey(key: string): key is TransactionSubtypeKey {
  return Object.hasOwn(TRANSACTION_SUBTYPE_ICONS, key);
}

/**
 * Total: any string, null, or undefined in — a renderable icon or `undefined` out, never a
 * throw. Deliberately NOT a fallback-icon function (unlike `resolveCategoryIcon`): every
 * existing row has `subtype = null`, and a visible fallback glyph here would change the look of
 * every historical row. `undefined` re-enters `TransactionRow`'s existing first-letter fallback
 * — the "no icon" state IS today's behavior (design.md Decision 4).
 */
export function resolveTransactionSubtypeIcon(key: string | null | undefined): LucideIcon | undefined {
  if (key && isTransactionSubtypeKey(key)) {
    return TRANSACTION_SUBTYPE_ICONS[key];
  }
  return undefined;
}
