// @vitest-environment node
//
// health-tracking Phase 2 — round-trip test for the two-hop recurring-provenance lookup
// (change: health-tracking, design.md Decision 1). Verifies bounded `createRecurringDefinition`
// (installment_* columns) + `listTransactionsByRecurring` (new plain-RLS read, no new RPC/SQL
// seam function). Same real-local-Supabase pattern as `tests/integration/finance-facade.test.ts`.

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

vi.mock("server-only", () => ({}));

let activeClient: SupabaseClient;
vi.mock("@/shared/supabase/server", () => ({
  createClient: async () => activeClient,
}));

const financeApi = await import("@/modules/finance/api");

async function bootstrapSpace(session: TestSession): Promise<{ householdId: string; accountId: string; categoryId: string }> {
  activeClient = session.client;
  const { error: bootstrapErr } = await session.client.schema("app").rpc("bootstrap_user");
  if (bootstrapErr) {
    throw new Error(`app.bootstrap_user() failed for ${session.email}: ${bootstrapErr.message}`);
  }

  const { data: household, error: hhErr } = await session.client
    .schema("core")
    .from("households")
    .select("id")
    .eq("personal_owner_user_id", session.userId)
    .single();
  if (hhErr || !household) {
    throw new Error(`could not resolve bootstrapped household for ${session.email}: ${hhErr?.message}`);
  }

  const { data: category, error: catErr } = await session.client
    .schema("finance")
    .from("categories")
    .select("id")
    .eq("household_id", household.id)
    .eq("kind", "expense")
    .limit(1)
    .single();
  if (catErr || !category) {
    throw new Error(`could not resolve a seeded expense category for ${session.email}: ${catErr?.message}`);
  }

  const account = await financeApi.createAccount({
    householdId: household.id as string,
    name: "Health Recurring Test Account",
    type: "checking",
    openingBalanceCents: 0,
    visibility: "household",
    sortOrder: 0,
  });
  if (!account.ok) {
    throw new Error(`could not create test account: ${account.error.message}`);
  }

  return { householdId: household.id as string, accountId: account.value.id, categoryId: category.id as string };
}

describe("recurring definitions — bounded occurrences + listTransactionsByRecurring (health-tracking Phase 2)", () => {
  let householdId: string;
  let accountId: string;
  let categoryId: string;

  beforeAll(async () => {
    const session = await signUpAndSignIn("recurring-bounded");
    const bootstrapped = await bootstrapSpace(session);
    householdId = bootstrapped.householdId;
    accountId = bootstrapped.accountId;
    categoryId = bootstrapped.categoryId;
  }, 30000);

  it("creating a bounded definition persists installmentTotal/installmentsRemaining from totalOccurrences", async () => {
    const { id, error } = await financeApi.createRecurringDefinition(activeClient, {
      householdId,
      accountId,
      type: "expense",
      categoryId,
      amountCents: 15000,
      description: "3-dose vaccine series",
      frequency: "monthly",
      nextDueDate: "2026-09-01",
      bounded: { totalOccurrences: 3, anchorDate: "2026-09-01" },
    });
    expect(error).toBeNull();
    expect(id).not.toBeNull();

    const list = await financeApi.listRecurringDefinitions(activeClient, householdId);
    const created = list.find((d) => d.id === id);
    expect(created?.installmentTotal).toBe(3);
    expect(created?.installmentsRemaining).toBe(3);
  });

  it("a definition created without `bounded` still reads back null installmentTotal/installmentsRemaining", async () => {
    const { id, error } = await financeApi.createRecurringDefinition(activeClient, {
      householdId,
      accountId,
      type: "expense",
      categoryId,
      amountCents: 3000,
      description: "Monthly checkup (unbounded)",
      frequency: "monthly",
      nextDueDate: "2026-09-01",
    });
    expect(error).toBeNull();

    const list = await financeApi.listRecurringDefinitions(activeClient, householdId);
    const created = list.find((d) => d.id === id);
    expect(created?.installmentTotal).toBeNull();
    expect(created?.installmentsRemaining).toBeNull();
  });

  it("listTransactionsByRecurring resolves every posted occurrence for a definition's recurring_id, none for an unrelated one", async () => {
    const { id: recurringId, error } = await financeApi.createRecurringDefinition(activeClient, {
      householdId,
      accountId,
      type: "expense",
      categoryId,
      amountCents: 5000,
      description: "Follow-up series",
      frequency: "monthly",
      nextDueDate: "2026-09-01",
      bounded: { totalOccurrences: 2, anchorDate: "2026-09-01" },
    });
    expect(error).toBeNull();
    expect(recurringId).not.toBeNull();

    const confirmed = await financeApi.confirmRecurring({ recurringId: recurringId as string });
    expect(confirmed.ok).toBe(true);

    const occurrences = await financeApi.listTransactionsByRecurring(activeClient, householdId, recurringId as string);
    expect(occurrences.length).toBe(1);
    // Decision 6 (accepted mislabel): confirm_recurring_transaction hardcodes the installment
    // "(n/total)" description suffix whenever installment_group_id is set, which a bounded
    // health series also carries — this is the documented cosmetic side effect, not a bug here.
    expect(occurrences[0]?.description).toBe("Follow-up series (1/2)");

    const { id: otherId } = await financeApi.createRecurringDefinition(activeClient, {
      householdId,
      accountId,
      type: "expense",
      categoryId,
      amountCents: 2000,
      description: "Unrelated definition",
      frequency: "monthly",
      nextDueDate: "2026-09-01",
    });
    const unrelatedOccurrences = await financeApi.listTransactionsByRecurring(activeClient, householdId, otherId as string);
    expect(unrelatedOccurrences.length).toBe(0);
  });
});
