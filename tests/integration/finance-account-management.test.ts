// @vitest-environment node
//
// T1.6 — Integration tests for `finance.update_account` / `finance.set_account_archived` /
// `finance.delete_account` (change: finance-account-edit) against the REAL local Supabase
// stack, following `tests/integration/finance-facade.test.ts`'s established pattern: real
// signed-in test users via `helpers/local-supabase.ts`, real HTTP round trips, real RLS/
// SECURITY DEFINER checks. These RPCs are called directly (not yet through `finance/api`,
// which is Slice 2's responsibility) to isolate the migration's own correctness.

import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

async function bootstrapSpace(session: TestSession): Promise<{ householdId: string }> {
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

async function createAccount(
  client: SupabaseClient,
  householdId: string,
  overrides: { name: string; type: string; openingBalanceCents?: number },
) {
  const { data, error } = await client.schema("finance").rpc("create_account", {
    p_household_id: householdId,
    p_name: overrides.name,
    p_type: overrides.type,
    p_opening_balance_cents: overrides.openingBalanceCents ?? 0,
    p_visibility: "household",
    p_sort_order: 0,
  });
  if (error) throw new Error(`create_account failed: ${error.message}`);
  return data as string;
}

async function detailRowCounts(client: SupabaseClient, accountId: string) {
  const [liab, goal, inv, loan] = await Promise.all([
    client.schema("finance").from("account_liability_details").select("account_id").eq("account_id", accountId),
    client.schema("finance").from("account_goal_details").select("account_id").eq("account_id", accountId),
    client.schema("finance").from("account_investment_details").select("account_id").eq("account_id", accountId),
    client.schema("finance").from("account_loaned_details").select("account_id").eq("account_id", accountId),
  ]);
  return {
    liability: liab.data?.length ?? 0,
    goal: goal.data?.length ?? 0,
    investment: inv.data?.length ?? 0,
    loaned: loan.data?.length ?? 0,
  };
}

describe("finance.update_account / set_account_archived / delete_account — live local Supabase (T1.6)", () => {
  let userA: TestSession;
  let userB: TestSession;
  let householdA: string;
  let householdB: string;

  beforeAll(async () => {
    userA = await signUpAndSignIn("acct-mgmt-a");
    userB = await signUpAndSignIn("acct-mgmt-b");
    householdA = (await bootstrapSpace(userA)).householdId;
    householdB = (await bootstrapSpace(userB)).householdId;
  }, 30000);

  describe("update_account — retype leaves exactly one detail row", () => {
    it("cash -> liability: inserts exactly one liability row, no orphan", async () => {
      const id = await createAccount(userA.client, householdA, { name: "Retype cash->liability", type: "cash" });

      const { error } = await userA.client.schema("finance").rpc("update_account", {
        p_account_id: id,
        p_household_id: householdA,
        p_name: "Retype cash->liability",
        p_type: "liability",
        p_original_amount_cents: 100000,
        p_interest_rate_bp: 500,
        p_term_months: 12,
        p_monthly_payment_cents: 9000,
        p_start_date: "2026-01-01",
      });
      expect(error).toBeNull();

      const counts = await detailRowCounts(userA.client, id);
      expect(counts).toEqual({ liability: 1, goal: 0, investment: 0, loaned: 0 });

      const { data: acct } = await userA.client
        .schema("finance")
        .from("accounts")
        .select("type, class")
        .eq("id", id)
        .single();
      expect(acct?.type).toBe("liability");
      expect(acct?.class).toBe("liability");
    });

    it("liability -> cash: discards liability detail, no new detail row, class flips to asset", async () => {
      const id = await createAccount(userA.client, householdA, { name: "Retype liability->cash", type: "cash" });
      await userA.client.schema("finance").rpc("update_account", {
        p_account_id: id,
        p_household_id: householdA,
        p_name: "Retype liability->cash",
        p_type: "liability",
        p_original_amount_cents: 100000,
        p_interest_rate_bp: 500,
        p_term_months: 12,
        p_monthly_payment_cents: 9000,
        p_start_date: "2026-01-01",
      });

      const { error } = await userA.client.schema("finance").rpc("update_account", {
        p_account_id: id,
        p_household_id: householdA,
        p_name: "Retype liability->cash",
        p_type: "cash",
      });
      expect(error).toBeNull();

      const counts = await detailRowCounts(userA.client, id);
      expect(counts).toEqual({ liability: 0, goal: 0, investment: 0, loaned: 0 });

      const { data: acct } = await userA.client
        .schema("finance")
        .from("accounts")
        .select("type, class")
        .eq("id", id)
        .single();
      expect(acct?.type).toBe("cash");
      expect(acct?.class).toBe("asset");
    });

    it("rejects a retype missing the incoming type's required detail (22023)", async () => {
      const id = await createAccount(userA.client, householdA, { name: "Retype missing detail", type: "cash" });

      const { error } = await userA.client.schema("finance").rpc("update_account", {
        p_account_id: id,
        p_household_id: householdA,
        p_name: "Retype missing detail",
        p_type: "savings_goal",
        // p_target_amount_cents omitted on purpose
      });
      expect(error?.code).toBe("22023");
    });

    // WARNING-1 (sdd-verify finance-account-edit): design.md Decision 1 states
    // account_credit_card_details must be deleted inside update_account too when leaving
    // credit_card, same as the other four exclusive detail tables. It was missing.
    it("credit_card -> cash: deletes the orphaned account_credit_card_details row", async () => {
      const id = await createAccount(userA.client, householdA, { name: "Retype cc->cash", type: "credit_card" });
      const { error: insertErr } = await userA.client
        .schema("finance")
        .from("account_credit_card_details")
        .insert({ account_id: id, credit_limit_cents: 500000, statement_day: 5, due_day: 20, min_payment_cents: 20000 });
      expect(insertErr).toBeNull();

      const { error } = await userA.client.schema("finance").rpc("update_account", {
        p_account_id: id,
        p_household_id: householdA,
        p_name: "Retype cc->cash",
        p_type: "cash",
      });
      expect(error).toBeNull();

      const { data: cardRows } = await userA.client
        .schema("finance")
        .from("account_credit_card_details")
        .select("account_id")
        .eq("account_id", id);
      expect(cardRows?.length ?? 0).toBe(0);
    });
  });

  describe("update_account — rename only", () => {
    it("renames without touching type/class", async () => {
      const id = await createAccount(userA.client, householdA, { name: "Old Name", type: "checking" });

      const { error } = await userA.client.schema("finance").rpc("update_account", {
        p_account_id: id,
        p_household_id: householdA,
        p_name: "New Name",
        p_type: "checking",
      });
      expect(error).toBeNull();

      const { data: acct } = await userA.client.schema("finance").from("accounts").select("name, type").eq("id", id).single();
      expect(acct?.name).toBe("New Name");
      expect(acct?.type).toBe("checking");
    });
  });

  describe("cross-household rejection", () => {
    it("update_account refuses an account id belonging to another household", async () => {
      const idB = await createAccount(userB.client, householdB, { name: "Household B account", type: "cash" });

      const { error } = await userA.client.schema("finance").rpc("update_account", {
        p_account_id: idB,
        p_household_id: householdA,
        p_name: "Hijack attempt",
        p_type: "cash",
      });
      expect(error).not.toBeNull();
      expect(error?.code).toBe("P0002");
    });

    it("set_account_archived refuses an account id belonging to another household", async () => {
      const idB = await createAccount(userB.client, householdB, { name: "Household B account 2", type: "cash" });

      const { error } = await userA.client.schema("finance").rpc("set_account_archived", {
        p_account_id: idB,
        p_household_id: householdA,
        p_archived: true,
      });
      expect(error).not.toBeNull();
      expect(error?.code).toBe("P0002");
    });

    it("delete_account refuses an account id belonging to another household", async () => {
      const idB = await createAccount(userB.client, householdB, { name: "Household B account 3", type: "cash" });

      const { error } = await userA.client.schema("finance").rpc("delete_account", {
        p_account_id: idB,
        p_household_id: householdA,
      });
      expect(error).not.toBeNull();
      expect(error?.code).toBe("P0002");
    });
  });

  describe("set_account_archived — pause/reactivate round trip", () => {
    it("sets archived_at then clears it", async () => {
      const id = await createAccount(userA.client, householdA, { name: "Pause round trip", type: "cash" });

      const pause = await userA.client.schema("finance").rpc("set_account_archived", {
        p_account_id: id,
        p_household_id: householdA,
        p_archived: true,
      });
      expect(pause.error).toBeNull();

      const { data: paused } = await userA.client.schema("finance").from("accounts").select("archived_at").eq("id", id).single();
      expect(paused?.archived_at).not.toBeNull();

      const resume = await userA.client.schema("finance").rpc("set_account_archived", {
        p_account_id: id,
        p_household_id: householdA,
        p_archived: false,
      });
      expect(resume.error).toBeNull();

      const { data: active } = await userA.client.schema("finance").from("accounts").select("archived_at").eq("id", id).single();
      expect(active?.archived_at).toBeNull();
    });
  });

  describe("delete_account — history precondition", () => {
    it("hard-deletes a zero-transaction account", async () => {
      const id = await createAccount(userA.client, householdA, { name: "Delete me", type: "cash" });

      const { error } = await userA.client.schema("finance").rpc("delete_account", {
        p_account_id: id,
        p_household_id: householdA,
      });
      expect(error).toBeNull();

      const { data: acct } = await userA.client.schema("finance").from("accounts").select("id").eq("id", id).maybeSingle();
      expect(acct).toBeNull();
    });

    it("refuses to delete an account with transaction history (2BP01), even called directly", async () => {
      const id = await createAccount(userA.client, householdA, { name: "Has history", type: "cash" });

      const { data: category } = await userA.client
        .schema("finance")
        .from("categories")
        .select("id")
        .eq("household_id", householdA)
        .eq("kind", "expense")
        .limit(1)
        .single();

      const { error: txErr } = await userA.client.schema("finance").rpc("record_transaction", {
        p_household_id: householdA,
        p_account_id: id,
        p_category_id: category!.id,
        p_kind: "expense",
        p_amount_cents: 500,
        p_occurred_on: "2026-01-01",
        p_description: "test spend",
        p_origin_module: "manual",
        p_origin_entity_id: null,
        p_idempotency_key: null,
        p_subtype: null,
      });
      expect(txErr).toBeNull();

      const { error } = await userA.client.schema("finance").rpc("delete_account", {
        p_account_id: id,
        p_household_id: householdA,
      });
      expect(error).not.toBeNull();
      expect(error?.code).toBe("2BP01");

      const { data: stillThere } = await userA.client.schema("finance").from("accounts").select("id").eq("id", id).maybeSingle();
      expect(stillThere).not.toBeNull();
    });

    it("refuses to delete an account referenced by a recurring definition (account_id or to_account_id)", async () => {
      const fromId = await createAccount(userA.client, householdA, { name: "Recurring from", type: "cash" });
      const toId = await createAccount(userA.client, householdA, { name: "Recurring to", type: "cash" });

      // Plain RLS-guarded insert, same path `createRecurringDefinition` uses
      // (recurring-repository.ts) for a `type: "transfer"` definition.
      const { error: insertErr } = await userA.client.schema("finance").from("recurring_transactions").insert({
        household_id: householdA,
        account_id: fromId,
        to_account_id: toId,
        type: "transfer",
        amount_cents: 1000,
        description: "recurring transfer",
        frequency: "monthly",
        next_due_date: "2026-02-01",
      });
      expect(insertErr).toBeNull();

      const { error: deleteFromErr } = await userA.client.schema("finance").rpc("delete_account", {
        p_account_id: fromId,
        p_household_id: householdA,
      });
      expect(deleteFromErr?.code).toBe("2BP01");

      const { error: deleteToErr } = await userA.client.schema("finance").rpc("delete_account", {
        p_account_id: toId,
        p_household_id: householdA,
      });
      expect(deleteToErr?.code).toBe("2BP01");
    });
  });
});
