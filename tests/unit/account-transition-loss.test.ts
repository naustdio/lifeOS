// Vitest — pure unit tests for `transitionLoss` / `flipsClass` (change: finance-account-edit
// T3.2, design.md Decision 2/3). No DB, no mocks — both functions are pure.

import { describe, expect, it } from "vitest";
import { transitionLoss, flipsClass, DETAIL_FIELD_LABELS } from "@/modules/finance/api/account-shape";
import { deriveAccountClass, type AccountType } from "@/modules/finance/domain/account";

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

const DETAIL_TYPES: AccountType[] = ["liability", "savings_goal", "investment", "loaned"];
const NO_DETAIL_TYPES: AccountType[] = ["cash", "checking", "credit_card", "savings"];

describe("transitionLoss() — 8x8 matrix", () => {
  it("returns [] for every same-type transition (no-op)", () => {
    for (const t of ALL_TYPES) {
      expect(transitionLoss(t, t)).toEqual([]);
    }
  });

  it("returns [] when fromType has no detail fields, regardless of toType", () => {
    for (const from of NO_DETAIL_TYPES) {
      for (const to of ALL_TYPES) {
        if (from === to) continue;
        expect(transitionLoss(from, to)).toEqual([]);
      }
    }
  });

  it("returns fromType's full detail-field list for every cross-type transition out of a detail type", () => {
    for (const from of DETAIL_TYPES) {
      for (const to of ALL_TYPES) {
        if (from === to) continue;
        const loss = transitionLoss(from, to);
        const expectedLabels = DETAIL_FIELD_LABELS[from];
        expect(loss.map((l) => l.field).sort()).toEqual(Object.keys(expectedLabels).sort());
        for (const { field, label } of loss) {
          expect(label).toBe(expectedLabels[field]);
        }
      }
    }
  });

  it("liability -> cash names interest rate, term, and monthly payment among discarded fields", () => {
    const loss = transitionLoss("liability", "cash");
    const fields = loss.map((l) => l.field);
    expect(fields).toContain("interestRateBp");
    expect(fields).toContain("termMonths");
    expect(fields).toContain("monthlyPaymentCents");
  });

  it("cash -> checking (no detail on either side) shows no warning", () => {
    expect(transitionLoss("cash", "checking")).toEqual([]);
  });
});

describe("flipsClass() — every asset/liability boundary pair", () => {
  it("matches deriveAccountClass(from) !== deriveAccountClass(to) for the full 8x8 matrix", () => {
    for (const from of ALL_TYPES) {
      for (const to of ALL_TYPES) {
        const expected = deriveAccountClass(from) !== deriveAccountClass(to);
        expect(flipsClass(from, to)).toBe(expected);
      }
    }
  });

  it("asset -> liability flips (e.g. savings -> liability)", () => {
    expect(flipsClass("savings", "liability")).toBe(true);
  });

  it("asset -> asset does not flip (e.g. cash -> checking)", () => {
    expect(flipsClass("cash", "checking")).toBe(false);
  });

  it("liability -> liability does not flip (e.g. liability -> credit_card)", () => {
    expect(flipsClass("liability", "credit_card")).toBe(false);
  });
});
