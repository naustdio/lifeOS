// Vitest — pure `finance/domain/account.ts` unit tests for the eight-type expansion
// (design.md §3, tasks.md A-004 [RED] / A-005 [GREEN]). Mirrors the DB trigger
// (derive_account_class()) and the type-CHECK constraint (accounts_type_check) without a DB
// dependency.

import { describe, expect, it } from "vitest";
import {
  type AccountType,
  deriveAccountClass,
  includedInAvailableCents,
  requiresInvestmentDetail,
  requiresLoanedDetail,
} from "@/modules/finance/domain/account";

const ALL_TYPES: AccountType[] = [
  "cash",
  "checking",
  "credit_card",
  "savings",
  "liability",
  "savings_goal",
  "investment",
  "loaned",
];

describe("deriveAccountClass / includedInAvailableCents — investment & loaned", () => {
  it("derives 'asset' for both investment and loaned", () => {
    expect(deriveAccountClass("investment")).toBe("asset");
    expect(deriveAccountClass("loaned")).toBe("asset");
  });
  it("includes both investment and loaned in available_cents", () => {
    expect(includedInAvailableCents("investment")).toBe(true);
    expect(includedInAvailableCents("loaned")).toBe(true);
  });
});

describe("requiresInvestmentDetail / requiresLoanedDetail", () => {
  it("requiresInvestmentDetail is true only for 'investment'", () => {
    for (const t of ALL_TYPES) {
      expect(requiresInvestmentDetail(t)).toBe(t === "investment");
    }
  });
  it("requiresLoanedDetail is true only for 'loaned'", () => {
    for (const t of ALL_TYPES) {
      expect(requiresLoanedDetail(t)).toBe(t === "loaned");
    }
  });
});

describe("AccountType exhaustiveness — the union must have exactly eight members", () => {
  it("recognizes exactly the eight literals, with no member missing or extra", () => {
    // Compile-time exhaustiveness: this switch must handle every AccountType member with no
    // `default` branch. If a literal is added to the union without a case here, `never` fails
    // to typecheck (tsc --noEmit) and this assertion also fails at runtime.
    function isKnown(t: AccountType): true {
      switch (t) {
        case "cash":
        case "checking":
        case "credit_card":
        case "savings":
        case "liability":
        case "savings_goal":
        case "investment":
        case "loaned":
          return true;
        default: {
          const _exhaustive: never = t;
          throw new Error(`unhandled AccountType: ${_exhaustive}`);
        }
      }
    }
    for (const t of ALL_TYPES) {
      expect(isKnown(t)).toBe(true);
    }
    expect(ALL_TYPES).toHaveLength(8);
  });
});
