// @vitest-environment node
//
// T2.7 — Integration tests for `getAccountById` / `listArchivedAccounts` (change:
// finance-account-edit) against the REAL local Supabase stack, through the `finance/api` facade
// — same pattern as `tests/integration/finance-facade.test.ts`.

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

vi.mock("server-only", () => ({}));

let activeClient: SupabaseClient;
vi.mock("@/shared/supabase/server", () => ({
  createClient: async () => activeClient,
}));

const financeApi = await import("@/modules/finance/api");

async function bootstrapSpace(session: TestSession): Promise<{ householdId: string }> {
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

  return { householdId: household.id as string };
}

describe("getAccountById() / listArchivedAccounts() — live local Supabase (T2.7)", () => {
  let userA: TestSession;
  let userB: TestSession;
  let householdA: string;
  let householdB: string;

  beforeAll(async () => {
    userA = await signUpAndSignIn("acct-repo-a");
    userB = await signUpAndSignIn("acct-repo-b");
    householdA = (await bootstrapSpace(userA)).householdId;
    householdB = (await bootstrapSpace(userB)).householdId;
    activeClient = userA.client;
  }, 30000);

  it("getAccountById returns null for a missing id", async () => {
    activeClient = userA.client;
    const result = await financeApi.getAccountById(userA.client, householdA, "00000000-0000-4000-8000-000000000000");
    expect(result).toBeNull();
  });

  it("getAccountById returns null for an id belonging to another household", async () => {
    activeClient = userB.client;
    const created = await financeApi.createAccount({
      householdId: householdB,
      name: "Household B only",
      type: "cash",
      openingBalanceCents: 0,
      visibility: "household",
      sortOrder: 0,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    activeClient = userA.client;
    const result = await financeApi.getAccountById(userA.client, householdA, created.value.id);
    expect(result).toBeNull();
  });

  it("getAccountById returns a PAUSED account (deliberately no archived_at filtering)", async () => {
    activeClient = userA.client;
    const created = await financeApi.createAccount({
      householdId: householdA,
      name: "To be paused",
      type: "cash",
      openingBalanceCents: 0,
      visibility: "household",
      sortOrder: 0,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const archived = await financeApi.setAccountArchived({
      accountId: created.value.id,
      householdId: householdA,
      archived: true,
    });
    expect(archived.ok).toBe(true);

    const result = await financeApi.getAccountById(userA.client, householdA, created.value.id);
    expect(result).not.toBeNull();
    expect(result?.archivedAt).not.toBeNull();
    expect(result?.name).toBe("To be paused");
  });

  // CRITICAL-1 (sdd-verify finance-account-edit): getAccountById must hydrate the existing
  // card-terms row for a credit_card account so the edit form can prefill real values instead
  // of blanks — prefilling blanks was what caused the edit form's full-row upsert to silently
  // null out untouched card fields.
  it("getAccountById hydrates existing card terms for a credit_card account", async () => {
    activeClient = userA.client;
    const created = await financeApi.createAccount({
      householdId: householdA,
      name: "Card with terms",
      type: "credit_card",
      openingBalanceCents: 0,
      visibility: "household",
      sortOrder: 0,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const upserted = await financeApi.upsertCardDetails(userA.client, created.value.id, {
      creditLimitCents: 500000,
      statementDay: 5,
      dueDay: 20,
      minPaymentCents: 20000,
    });
    expect(upserted.error).toBeNull();

    const result = await financeApi.getAccountById(userA.client, householdA, created.value.id);
    expect(result?.card).toEqual({
      creditLimitCents: 500000,
      statementDay: 5,
      dueDay: 20,
      minPaymentCents: 20000,
    });
  });

  it("getAccountById returns no card terms for a credit_card account with none saved yet", async () => {
    activeClient = userA.client;
    const created = await financeApi.createAccount({
      householdId: householdA,
      name: "Card without terms",
      type: "credit_card",
      openingBalanceCents: 0,
      visibility: "household",
      sortOrder: 0,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await financeApi.getAccountById(userA.client, householdA, created.value.id);
    expect(result?.card).toBeUndefined();
  });

  it("listArchivedAccounts returns only archived accounts scoped to the household", async () => {
    activeClient = userA.client;
    const activeAcc = await financeApi.createAccount({
      householdId: householdA,
      name: "Stays active",
      type: "cash",
      openingBalanceCents: 0,
      visibility: "household",
      sortOrder: 0,
    });
    const pausedAcc = await financeApi.createAccount({
      householdId: householdA,
      name: "Gets paused for list test",
      type: "cash",
      openingBalanceCents: 0,
      visibility: "household",
      sortOrder: 0,
    });
    expect(activeAcc.ok && pausedAcc.ok).toBe(true);
    if (!activeAcc.ok || !pausedAcc.ok) return;

    await financeApi.setAccountArchived({ accountId: pausedAcc.value.id, householdId: householdA, archived: true });

    const archivedList = await financeApi.listArchivedAccounts(userA.client, householdA);
    const ids = archivedList.map((a) => a.id);
    expect(ids).toContain(pausedAcc.value.id);
    expect(ids).not.toContain(activeAcc.value.id);
  });
});
