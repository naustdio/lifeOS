// @vitest-environment node
//
// Sub-slice 2C (T-036) — exercises the ACTUAL UI calling code path
// (`src/app/(app)/cuentas/actions.ts`'s `createAccountAction`, the exact
// Server Action `AccountForm` submits to) against the real local Supabase
// stack, following the same pattern `tests/integration/finance-facade.test.ts`
// (T-032) established: a real signed-in user, real HTTP round trips, real
// RLS/SECURITY DEFINER checks — not a mock of the database or the seam.
//
// `next/navigation`'s `redirect()` and `next/cache`'s `revalidatePath()` are
// mocked as no-ops: outside an actual Next.js request they have nothing
// useful to do, and the action's own return value on the redirect path is
// irrelevant to this test — what matters is whether the account round-trips.

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, signUpAndSignIn, type TestSession } from "./helpers/local-supabase";
import { listActiveAccounts } from "@/modules/finance/data/account-repository";

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

// Imported after the mocks above (vitest hoists `vi.mock`, so this resolves against them).
const { createAccountAction } = await import("@/app/(app)/cuentas/actions");

function formDataFrom(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("account-creation UI calling code path — live local Supabase (T-036)", () => {
  let session: TestSession;
  let householdId: string;

  beforeAll(async () => {
    session = await signUpAndSignIn("ui-cuentas");
    activeClient = session.client;
    const { error } = await session.client.schema("app").rpc("bootstrap_user");
    if (error) throw new Error(`bootstrap_user failed: ${error.message}`);
    const { data: household } = await session.client
      .schema("core")
      .from("households")
      .select("id")
      .eq("personal_owner_user_id", session.userId)
      .single();
    householdId = household!.id as string;
  }, 30000);

  it("creates a cash account through the real Server Action and it round-trips in the DB", async () => {
    activeClient = session.client;
    const formData = formDataFrom({
      name: "Efectivo UI",
      type: "cash",
      openingBalance: "150.50",
    });

    await expect(createAccountAction({ error: null }, formData)).rejects.toThrow("NEXT_REDIRECT");

    const { data: row, error } = await session.client
      .schema("finance")
      .from("accounts")
      .select("id, name, type, class, household_id, opening_balance_cents")
      .eq("household_id", householdId)
      .eq("name", "Efectivo UI")
      .single();

    expect(error).toBeNull();
    expect(row?.type).toBe("cash");
    expect(row?.class).toBe("asset");
    expect(Number(row?.opening_balance_cents)).toBe(15050);
  });

  it("creates a liability account with its detail row through the same form fields AccountForm submits", async () => {
    activeClient = session.client;
    const formData = formDataFrom({
      name: "Préstamo UI",
      type: "liability",
      openingBalance: "-5000",
      originalAmount: "5000",
      interestRateBp: "1200",
      termMonths: "24",
      monthlyPayment: "250",
      startDate: "2026-01-01",
    });

    await expect(createAccountAction({ error: null }, formData)).rejects.toThrow("NEXT_REDIRECT");

    const { data: account } = await session.client
      .schema("finance")
      .from("accounts")
      .select("id, class")
      .eq("household_id", householdId)
      .eq("name", "Préstamo UI")
      .single();
    expect(account?.class).toBe("liability");

    const { data: detail } = await session.client
      .schema("finance")
      .from("account_liability_details")
      .select("term_months, monthly_payment_cents")
      .eq("account_id", account!.id)
      .single();
    expect(detail?.term_months).toBe(24);
    expect(Number(detail?.monthly_payment_cents)).toBe(25000);
  });

  it("surfaces ACCOUNT_DETAIL_REQUIRED as a Spanish inline form error instead of throwing", async () => {
    activeClient = session.client;
    const formData = formDataFrom({
      name: "Bad Credit Card UI",
      type: "credit_card",
      openingBalance: "500", // positive balance on a debt-bearing type is rejected
    });

    const result = await createAccountAction({ error: null }, formData);
    expect(result.error).not.toBeNull();
    expect(result.error).toContain("saldo inicial");
  });

  it("creates an investment account and the read path (B-001) returns its cost basis/current value detail", async () => {
    activeClient = session.client;
    const formData = formDataFrom({
      name: "ETF Global UI",
      type: "investment",
      openingBalance: "1000",
      costBasis: "1000",
      currentValue: "1200",
      valuedOn: "2026-08-01",
    });

    await expect(createAccountAction({ error: null }, formData)).rejects.toThrow("NEXT_REDIRECT");

    const accounts = await listActiveAccounts(session.client, householdId);
    const acc = accounts.find((a) => a.name === "ETF Global UI");
    expect(acc?.type).toBe("investment");
    expect(acc?.class).toBe("asset");
    expect(acc?.investment).toBeDefined();
    expect(acc?.investment?.costBasisCents).toBe(100000);
    expect(acc?.investment?.currentValueCents).toBe(120000);
    // Rendimiento (gain) is derived client-side as currentValueCents - balanceCents.
    expect((acc?.investment?.currentValueCents ?? 0) - (acc?.balanceCents ?? 0)).toBeGreaterThan(0);
  });

  it("creates a loaned account and the read path (B-001) returns its counterparty detail", async () => {
    activeClient = session.client;
    const formData = formDataFrom({
      name: "Prestado a Ana UI",
      type: "loaned",
      openingBalance: "800",
      counterpartyName: "Ana",
      originalAmount: "800",
    });

    await expect(createAccountAction({ error: null }, formData)).rejects.toThrow("NEXT_REDIRECT");

    const accounts = await listActiveAccounts(session.client, householdId);
    const acc = accounts.find((a) => a.name === "Prestado a Ana UI");
    expect(acc?.type).toBe("loaned");
    expect(acc?.class).toBe("asset");
    expect(acc?.loaned).toBeDefined();
    expect(acc?.loaned?.counterpartyName).toBe("Ana");
    expect(acc?.loaned?.originalAmountCents).toBe(80000);
  });

  it("rejects a request from a user with no bootstrapped space with the NOT_A_MEMBER copy", async () => {
    const admin = adminClient();
    const email = `no-space-${Date.now()}@example.com`;
    const { data: created } = await admin.auth.admin.createUser({
      email,
      password: "correct horse battery staple 1!",
      email_confirm: true,
    });
    // Deliberately never call app.bootstrap_user() for this user.
    void created;

    // createAccountAction's own getCurrentHouseholdId() resolves via
    // core.household_members, which has no row for this user — it should
    // return null and the action should short-circuit with an inline error,
    // never reach the RPC call at all.
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:55321",
      process.env.SUPABASE_TEST_ANON_KEY ??
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    await anon.auth.signInWithPassword({ email, password: "correct horse battery staple 1!" });
    activeClient = anon;

    const formData = formDataFrom({ name: "No Space", type: "cash", openingBalance: "0" });
    const result = await createAccountAction({ error: null }, formData);
    expect(result.error).toBe("No tienes acceso a este espacio.");

    activeClient = session.client;
  });
});
