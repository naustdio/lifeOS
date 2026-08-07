// Vitest — pure `finance/domain/recurring.ts` validateRecurringShape() unit tests (tasks.md
// CC-012, design.md §3). RED-first per this project's TDD policy: "the pure TS domain mirrors
// (credit-card.ts, validateRecurringShape)" are named critical-logic surfaces. This client-side
// mirror MUST reject exactly the two shapes the DB CHECKs reject (recurring_expense_shape /
// recurring_transfer_shape from 20260804090021_finance_recurring_transfer_shape.sql), as a
// defensive UX guard — the DB remains the source of truth.

import { describe, expect, it } from "vitest";
import { validateRecurringShape } from "@/modules/finance/domain";

describe("validateRecurringShape", () => {
  it("accepts a correctly-shaped expense definition (category set, no destination)", () => {
    expect(
      validateRecurringShape({ type: "expense", categoryId: "cat-1", toAccountId: null }),
    ).toBe(true);
  });

  it("accepts a correctly-shaped transfer definition (no category, destination set)", () => {
    expect(
      validateRecurringShape({ type: "transfer", categoryId: null, toAccountId: "acct-2" }),
    ).toBe(true);
  });

  it("rejects type=expense with categoryId null (mirrors recurring_expense_shape)", () => {
    expect(
      validateRecurringShape({ type: "expense", categoryId: null, toAccountId: null }),
    ).toBe(false);
  });

  it("rejects type=expense with toAccountId set (mirrors recurring_expense_shape)", () => {
    expect(
      validateRecurringShape({ type: "expense", categoryId: "cat-1", toAccountId: "acct-2" }),
    ).toBe(false);
  });

  it("rejects type=transfer with categoryId set (mirrors recurring_transfer_shape)", () => {
    expect(
      validateRecurringShape({ type: "transfer", categoryId: "cat-1", toAccountId: "acct-2" }),
    ).toBe(false);
  });

  it("rejects type=transfer with toAccountId null (mirrors recurring_transfer_shape)", () => {
    expect(
      validateRecurringShape({ type: "transfer", categoryId: null, toAccountId: null }),
    ).toBe(false);
  });

  it("rejects type=transfer whose toAccountId equals accountId (mirrors recurring_transfer_shape's self-transfer guard)", () => {
    expect(
      validateRecurringShape({
        type: "transfer",
        categoryId: null,
        toAccountId: "acct-1",
        accountId: "acct-1",
      }),
    ).toBe(false);
  });

  it("accepts type=transfer whose toAccountId differs from accountId", () => {
    expect(
      validateRecurringShape({
        type: "transfer",
        categoryId: null,
        toAccountId: "acct-2",
        accountId: "acct-1",
      }),
    ).toBe(true);
  });
});
