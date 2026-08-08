// @vitest-environment node
//
// Sub-slice 2C (T-037/T-038) — exercises the ACTUAL UI calling code path
// (`src/app/(app)/movimientos/actions.ts`, the exact Server Actions
// `TransactionForm`/`EditTransactionForm` submit to) against the real local
// Supabase stack. Same pattern as `account-creation-ui.test.ts` (T-036).

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" });
  }),
}));

let activeClient: SupabaseClient;
vi.mock("@/shared/supabase/server", () => ({
  createClient: async () => activeClient,
}));

const { recordMovementAction, recordTransferAction, updateMovementAction, voidMovementAction } = await import(
  "@/app/(app)/(finance)/movimientos/actions"
);

function formDataFrom(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("movement entry UI calling code path — live local Supabase (T-037/T-038)", () => {
  let session: TestSession;
  let householdId: string;
  let categoryId: string;
  let accountAId: string;
  let accountBId: string;

  beforeAll(async () => {
    session = await signUpAndSignIn("ui-movimientos");
    activeClient = session.client;

    const { error: bootstrapErr } = await session.client.schema("app").rpc("bootstrap_user");
    if (bootstrapErr) throw new Error(`bootstrap_user failed: ${bootstrapErr.message}`);

    const { data: household } = await session.client
      .schema("core")
      .from("households")
      .select("id")
      .eq("personal_owner_user_id", session.userId)
      .single();
    householdId = household!.id as string;

    const { data: category } = await session.client
      .schema("finance")
      .from("categories")
      .select("id")
      .eq("household_id", householdId)
      .eq("kind", "expense")
      .limit(1)
      .single();
    categoryId = category!.id as string;

    const { data: accountA } = await session.client
      .schema("finance")
      .rpc("create_account", { p_household_id: householdId, p_name: "Cuenta A", p_type: "checking" });
    accountAId = accountA as string;
    const { data: accountB } = await session.client
      .schema("finance")
      .rpc("create_account", { p_household_id: householdId, p_name: "Cuenta B", p_type: "savings" });
    accountBId = accountB as string;
  }, 30000);

  it("records an expense through the real Server Action and the balance view reflects it", async () => {
    activeClient = session.client;
    const formData = formDataFrom({
      kind: "expense",
      accountId: accountAId,
      categoryId,
      amount: "42.00",
      occurredOn: "2026-02-01",
      description: "Café",
    });

    await expect(recordMovementAction({ error: null }, formData)).rejects.toThrow("NEXT_REDIRECT");

    const { data: balance } = await session.client
      .schema("finance")
      .from("account_balances")
      .select("balance_cents")
      .eq("account_id", accountAId)
      .single();
    expect(Number(balance?.balance_cents)).toBe(-4200);
  });

  it("records a transfer through the real Server Action and both legs post", async () => {
    activeClient = session.client;
    const formData = formDataFrom({
      fromAccountId: accountAId,
      toAccountId: accountBId,
      amount: "10.00",
      occurredOn: "2026-02-02",
      description: "Ahorro",
    });

    await expect(recordTransferAction({ error: null }, formData)).rejects.toThrow("NEXT_REDIRECT");

    const { count } = await session.client
      .schema("finance")
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .eq("type", "transfer");
    expect(count).toBe(2);
  });

  it("edits a transaction's description through the real Server Action", async () => {
    activeClient = session.client;
    const created = formDataFrom({
      kind: "expense",
      accountId: accountAId,
      categoryId,
      amount: "5.00",
      occurredOn: "2026-02-03",
      description: "original",
    });
    await expect(recordMovementAction({ error: null }, created)).rejects.toThrow("NEXT_REDIRECT");

    const { data: tx } = await session.client
      .schema("finance")
      .from("transactions")
      .select("id")
      .eq("household_id", householdId)
      .eq("description", "original")
      .single();

    const edit = formDataFrom({ id: tx!.id as string, description: "corregido" });
    await expect(updateMovementAction({ error: null }, edit)).rejects.toThrow("NEXT_REDIRECT");

    const { data: updated } = await session.client
      .schema("finance")
      .from("transactions")
      .select("description")
      .eq("id", tx!.id as string)
      .single();
    expect(updated?.description).toBe("corregido");
  });

  it("voids a transaction through the real Server Action", async () => {
    activeClient = session.client;
    const created = formDataFrom({
      kind: "expense",
      accountId: accountAId,
      categoryId,
      amount: "8.00",
      occurredOn: "2026-02-04",
      description: "to-void",
    });
    await expect(recordMovementAction({ error: null }, created)).rejects.toThrow("NEXT_REDIRECT");

    const { data: tx } = await session.client
      .schema("finance")
      .from("transactions")
      .select("id")
      .eq("household_id", householdId)
      .eq("description", "to-void")
      .single();

    const voidForm = formDataFrom({ id: tx!.id as string, reason: "test void" });
    await expect(voidMovementAction({ error: null }, voidForm)).rejects.toThrow("NEXT_REDIRECT");

    const { data: voided } = await session.client
      .schema("finance")
      .from("transactions")
      .select("status")
      .eq("id", tx!.id as string)
      .single();
    expect(voided?.status).toBe("void");
  });
});
