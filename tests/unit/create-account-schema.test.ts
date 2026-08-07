// Vitest — pure `CreateAccountInputSchema` unit tests for the eight-type expansion (design.md
// §3, tasks.md A-007 [RED] / A-008 [GREEN]). No DB dependency; mirrors the `finance.create_account`
// definer's own exclusivity/sign checks at the Zod boundary, one layer before the RPC.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { CreateAccountInputSchema } = await import("@/modules/finance/api");

const base = {
  householdId: "11111111-1111-4111-8111-111111111111",
  name: "Test",
};

describe("CreateAccountInputSchema — investment branch", () => {
  it("accepts a well-formed investment branch", () => {
    const result = CreateAccountInputSchema.safeParse({
      ...base,
      type: "investment",
      investment: {
        costBasisCents: 300000,
        currentValueCents: 350000,
        valuedOn: "2026-06-01",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an investment branch with only the required cost basis", () => {
    const result = CreateAccountInputSchema.safeParse({
      ...base,
      type: "investment",
      investment: { costBasisCents: 100000 },
    });
    expect(result.success).toBe(true);
  });

  it("parses an investment branch and silently strips an unrelated loaned block (Zod default: unrecognized keys are stripped, not rejected — design.md §3's literal z.object() contract has no cross-field .superRefine; the real exclusivity guard is finance.create_account()'s v_has_* checks, proven by pgTAP)", () => {
    const result = CreateAccountInputSchema.safeParse({
      ...base,
      type: "investment",
      investment: { costBasisCents: 100000 },
      loaned: { counterpartyName: "Juan", originalAmountCents: 5000 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as { loaned?: unknown }).loaned).toBeUndefined();
    }
  });
});

describe("CreateAccountInputSchema — loaned branch", () => {
  it("accepts a well-formed loaned branch", () => {
    const result = CreateAccountInputSchema.safeParse({
      ...base,
      type: "loaned",
      loaned: {
        counterpartyName: "Juan",
        originalAmountCents: 5000,
        termMonths: 6,
        expectedReturnDate: "2026-12-01",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a loaned branch with an empty counterpartyName", () => {
    const result = CreateAccountInputSchema.safeParse({
      ...base,
      type: "loaned",
      loaned: { counterpartyName: "", originalAmountCents: 5000 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a loaned branch with a blank (whitespace-only) counterpartyName", () => {
    const result = CreateAccountInputSchema.safeParse({
      ...base,
      type: "loaned",
      loaned: { counterpartyName: "   ", originalAmountCents: 5000 },
    });
    expect(result.success).toBe(false);
  });
});
