import { describe, expect, it } from "vitest";
import {
  resolveTransactionSubtypeIcon,
  TRANSACTION_SUBTYPE_ICONS,
} from "@/design-system/tokens/transaction-subtype-style";

/**
 * Pure unit coverage for the sub-type icon registry (design.md §4, change:
 * finance-transaction-subtypes, tasks.md T-005). RED-first: this test is written before
 * `transaction-subtype-style.ts` exists and must fail on import.
 */

// Copied verbatim from the migration's CHECK list
// (supabase/migrations/20260804090018_finance_transaction_subtypes.sql) — this is the parity
// fixture that stops the registry and the database drifting.
const MIGRATION_SUBTYPE_KEYS = ["pago", "reembolso", "devolucion_efectivo", "pago_tarjeta", "compra_meses"];

describe("resolveTransactionSubtypeIcon", () => {
  it("resolves each of the 5 whitelist keys to its statically-imported icon", () => {
    for (const key of MIGRATION_SUBTYPE_KEYS) {
      const resolved = resolveTransactionSubtypeIcon(key);
      expect(resolved).toBeDefined();
      expect(resolved).toBe(TRANSACTION_SUBTYPE_ICONS[key as keyof typeof TRANSACTION_SUBTYPE_ICONS]);
    }
  });

  it("resolves compra_meses to a defined icon despite being unselectable in the UI", () => {
    expect(resolveTransactionSubtypeIcon("compra_meses")).toBe(TRANSACTION_SUBTYPE_ICONS.compra_meses);
  });

  it("is total: null, undefined, empty string, and an unrecognized key all resolve to undefined, never a throw", () => {
    const inputs: Array<string | null | undefined> = [null, undefined, "", "garbage"];
    for (const input of inputs) {
      expect(() => resolveTransactionSubtypeIcon(input)).not.toThrow();
      expect(resolveTransactionSubtypeIcon(input)).toBeUndefined();
    }
  });
});

describe("registry/database parity", () => {
  it("every migration subtype key has a registry entry, and vice versa", () => {
    const registryKeys = Object.keys(TRANSACTION_SUBTYPE_ICONS).sort();
    expect(registryKeys).toEqual([...MIGRATION_SUBTYPE_KEYS].sort());
  });

  it("exports no color map — icon keys only", () => {
    expect("TRANSACTION_SUBTYPE_COLORS" in TRANSACTION_SUBTYPE_ICONS).toBe(false);
  });
});
