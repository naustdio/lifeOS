// @vitest-environment node
//
// B8 — round-trip test for the boolean subscription marker (change: finance-subscriptions,
// spec "Subscription Boolean Marker" / "Recurring List Item Shape" / "Create/Update Payload
// Accepts the Subscription Flag"). Same real-local-Supabase pattern as
// `tests/integration/finance-facade.test.ts`: create -> edit -> list, against real Postgres/RLS,
// through the `finance/api` facade's re-exported repository functions.

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
    name: "Subscription Test Account",
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

describe("recurring definitions — is_subscription round trip (B8)", () => {
  let householdId: string;
  let accountId: string;
  let categoryId: string;

  beforeAll(async () => {
    const session = await signUpAndSignIn("recurring-sub");
    const bootstrapped = await bootstrapSpace(session);
    householdId = bootstrapped.householdId;
    accountId = bootstrapped.accountId;
    categoryId = bootstrapped.categoryId;
  }, 30000);

  it("creating a definition with isSubscription: true persists and reads back true", async () => {
    const { id, error } = await financeApi.createRecurringDefinition(activeClient, {
      householdId,
      accountId,
      type: "expense",
      categoryId,
      amountCents: 9900,
      description: "Streaming plan",
      frequency: "monthly",
      nextDueDate: "2026-09-01",
      isSubscription: true,
    });
    expect(error).toBeNull();
    expect(id).not.toBeNull();

    const list = await financeApi.listRecurringDefinitions(activeClient, householdId);
    const created = list.find((d) => d.id === id);
    expect(created?.isSubscription).toBe(true);
  });

  it("a definition created without the flag reads back false, and toggling it via update flips it to true without resetting other fields", async () => {
    const { id, error } = await financeApi.createRecurringDefinition(activeClient, {
      householdId,
      accountId,
      type: "expense",
      categoryId,
      amountCents: 5000,
      description: "Rent",
      frequency: "monthly",
      nextDueDate: "2026-09-01",
    });
    expect(error).toBeNull();
    expect(id).not.toBeNull();

    const beforeUpdate = await financeApi.listRecurringDefinitions(activeClient, householdId);
    const beforeDef = beforeUpdate.find((d) => d.id === id);
    expect(beforeDef?.isSubscription).toBe(false);

    const updateResult = await financeApi.updateRecurringDefinition(activeClient, householdId, id as string, {
      isSubscription: true,
    });
    expect(updateResult.error).toBeNull();

    const afterUpdate = await financeApi.listRecurringDefinitions(activeClient, householdId);
    const afterDef = afterUpdate.find((d) => d.id === id);
    expect(afterDef?.isSubscription).toBe(true);
    // Update omitted every other field — description/amount must be unchanged (partial-patch
    // semantics preserved, spec "Update omits the flag without resetting it" mirrored for the
    // opposite direction: omitting OTHER fields must not reset isSubscription's sibling data).
    expect(afterDef?.description).toBe("Rent");
    expect(afterDef?.amountCents).toBe(5000);
  });

  it("updating without isSubscription in the patch does not reset a previously-true value", async () => {
    const { id, error } = await financeApi.createRecurringDefinition(activeClient, {
      householdId,
      accountId,
      type: "expense",
      categoryId,
      amountCents: 1500,
      description: "Cloud storage",
      frequency: "monthly",
      nextDueDate: "2026-09-01",
      isSubscription: true,
    });
    expect(error).toBeNull();

    const updateResult = await financeApi.updateRecurringDefinition(activeClient, householdId, id as string, {
      description: "Cloud storage plan",
    });
    expect(updateResult.error).toBeNull();

    const list = await financeApi.listRecurringDefinitions(activeClient, householdId);
    const def = list.find((d) => d.id === id);
    expect(def?.isSubscription).toBe(true);
    expect(def?.description).toBe("Cloud storage plan");
  });
});
