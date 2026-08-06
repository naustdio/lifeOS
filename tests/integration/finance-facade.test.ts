// @vitest-environment node
//
// T-032 — Vitest contract tests: `finance/api` facade against the REAL local Supabase stack
// (design.md §9 row "Contract"; verify-report-2a WARNING #2). Unlike `tests/unit/finance-domain
// .test.ts` (pure logic, no DB), every call in this file goes out over real HTTP to the local
// PostgREST instance (`supabase start`) under a real signed-in user's real JWT, hits real
// Postgres, and is subject to real RLS/SECURITY DEFINER checks. Requires the local stack to be
// running (`supabase start`) — see `tests/integration/helpers/local-supabase.ts` for why the
// facade's `createClient()` (Next-cookie-bound) is swapped for a directly-signed-in client here.
//
// Scope per tasks.md T-032: Zod rejection of malformed input; each PG error code -> AppError
// mapping case from T-031; a replay of `recordTransaction` with the same idempotency key returns
// the same `TransactionRef` through the real facade/HTTP path, not the SQL function directly.

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

vi.mock("server-only", () => ({}));

let activeClient: SupabaseClient;
vi.mock("@/shared/supabase/server", () => ({
  createClient: async () => activeClient,
}));

// Imported after the mocks above (vitest hoists `vi.mock` calls, so this static import already
// resolves against the mocked `@/shared/supabase/server`).
const financeApi = await import("@/modules/finance/api");

type CreateAccountBase = { householdId: string; name: string; openingBalanceCents?: number };
type RecordTxBase = {
  householdId: string;
  accountId: string;
  categoryId: string;
  kind: "income" | "expense";
  amountCents: number;
  occurredOn: string;
  origin?: { module: "manual" | "shopping_list" | "car_control"; entityId: string };
  idempotencyKey?: string;
};

/** Fills the Zod-defaulted fields (`visibility`, `sortOrder`) so well-formed test inputs
 * satisfy `CreateAccountInput`'s OUTPUT type, matching how a real caller supplies them. Only
 * for the four detail-less account types used in this file — not a general-purpose builder. */
function mkAccount(overrides: CreateAccountBase & { type: "cash" | "checking" | "savings" | "credit_card" }) {
  return {
    openingBalanceCents: 0,
    visibility: "household" as const,
    sortOrder: 0,
    ...overrides,
  };
}

/** Fills the Zod-defaulted `description`/`origin` fields for `recordTransaction`. NOTE: the
 * facade's own runtime default (`{ module: "manual", entityId: "" }`, applied when a caller
 * OMITS `origin` entirely) would itself fail `entityId`'s `min(1)` check if explicitly supplied
 * as input rather than substituted by Zod's default path — so this placeholder uses a non-empty
 * `entityId` instead. That value has zero runtime effect either way: the facade forces
 * `p_origin_entity_id` to `null` whenever `origin.module === "manual"`, regardless of what
 * `entityId` contains. */
function mkTx(overrides: RecordTxBase) {
  return {
    description: "",
    origin: { module: "manual" as const, entityId: "manual" },
    ...overrides,
  };
}

async function bootstrapSpace(session: TestSession): Promise<{ householdId: string; categoryId: string }> {
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

  return { householdId: household.id as string, categoryId: category.id as string };
}

describe("finance/api facade — live local Supabase (T-032)", () => {
  let userA: TestSession;
  let userB: TestSession;
  let householdA: string;
  let categoryA: string;
  let householdB: string;

  beforeAll(async () => {
    userA = await signUpAndSignIn("facade-a");
    userB = await signUpAndSignIn("facade-b");
    const bootstrapped = await bootstrapSpace(userA);
    householdA = bootstrapped.householdId;
    categoryA = bootstrapped.categoryId;
    householdB = (await bootstrapSpace(userB)).householdId;
    activeClient = userA.client;
  }, 30000);

  describe("Zod validation — rejected before any RPC call", () => {
    it("rejects a liability CreateAccountInput missing the liability detail block", async () => {
      activeClient = userA.client;
      const result = await financeApi.createAccount({
        householdId: householdA,
        name: "Bad Liability",
        type: "liability",
      } as never);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a negative recordTransaction amountCents", async () => {
      activeClient = userA.client;
      const result = await financeApi.recordTransaction(
        mkTx({
          householdId: householdA,
          accountId: "00000000-0000-0000-0000-000000000000",
          categoryId: categoryA,
          kind: "expense",
          amountCents: -100,
          occurredOn: "2026-01-01",
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("createAccount — real round trip", () => {
    it("creates an account that exists with the correct class", async () => {
      activeClient = userA.client;
      const result = await financeApi.createAccount(
        mkAccount({ householdId: householdA, name: "Facade Checking", type: "checking", openingBalanceCents: 10000 }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.class).toBe("asset");

      const { data: row, error } = await userA.client
        .schema("finance")
        .from("accounts")
        .select("class, type, household_id")
        .eq("id", result.value.id)
        .single();
      expect(error).toBeNull();
      expect(row?.class).toBe("asset");
      expect(row?.type).toBe("checking");
      expect(row?.household_id).toBe(householdA);
    });

    it("maps a positive opening balance on credit_card to ACCOUNT_DETAIL_REQUIRED (22023)", async () => {
      activeClient = userA.client;
      const result = await financeApi.createAccount(
        mkAccount({ householdId: householdA, name: "Bad Credit Card", type: "credit_card", openingBalanceCents: 500 }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("ACCOUNT_DETAIL_REQUIRED");
    });

    it("maps a non-member householdId to NOT_A_MEMBER (42501)", async () => {
      activeClient = userA.client;
      const result = await financeApi.createAccount(
        mkAccount({ householdId: householdB, name: "Intruder", type: "cash" }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_A_MEMBER");
    });
  });

  describe("recordTransaction / balances — real round trip", () => {
    it("recordTransaction posts and the account_balances view reflects it", async () => {
      activeClient = userA.client;
      const account = await financeApi.createAccount(
        mkAccount({ householdId: householdA, name: "Facade Balance Test", type: "checking", openingBalanceCents: 20000 }),
      );
      expect(account.ok).toBe(true);
      if (!account.ok) return;

      const tx = await financeApi.recordTransaction(
        mkTx({
          householdId: householdA,
          accountId: account.value.id,
          categoryId: categoryA,
          kind: "expense",
          amountCents: 3000,
          occurredOn: "2026-01-15",
        }),
      );
      expect(tx.ok).toBe(true);
      if (!tx.ok) return;
      expect(tx.value.status).toBe("posted");

      const { data: balanceRow, error } = await userA.client
        .schema("finance")
        .from("account_balances")
        .select("balance_cents")
        .eq("account_id", account.value.id)
        .single();
      expect(error).toBeNull();
      expect(Number(balanceRow?.balance_cents)).toBe(17000);
    });

    it("replays recordTransaction with the same idempotency key through the real facade/HTTP path and returns the same TransactionRef", async () => {
      activeClient = userA.client;
      const account = await financeApi.createAccount(
        mkAccount({ householdId: householdA, name: "Facade Idempotency Test", type: "cash" }),
      );
      expect(account.ok).toBe(true);
      if (!account.ok) return;

      const idempotencyKey = `facade-idem-${Date.now()}`;
      const txInput = mkTx({
        householdId: householdA,
        accountId: account.value.id,
        categoryId: categoryA,
        kind: "expense",
        amountCents: 500,
        occurredOn: "2026-01-20",
        origin: { module: "shopping_list", entityId: "sl-facade-1" },
        idempotencyKey,
      });
      const first = await financeApi.recordTransaction(txInput);
      const second = await financeApi.recordTransaction(txInput);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.value.id).toBe(first.value.id);

      const { count } = await userA.client
        .schema("finance")
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("origin_module", "shopping_list")
        .eq("origin_entity_id", "sl-facade-1");
      expect(count).toBe(1);
    });
  });

  describe("update/void — PG error mapping through the real facade path", () => {
    it("findByOrigin returns null (not an error) when absent", async () => {
      activeClient = userA.client;
      const result = await financeApi.findByOrigin({
        householdId: householdA,
        module: "shopping_list",
        entityId: "sl-does-not-exist",
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });

    it("maps updating a non-existent transaction to NOT_FOUND (P0002)", async () => {
      activeClient = userA.client;
      const result = await financeApi.updateTransaction("00000000-0000-0000-0000-000000000000", {
        description: "nope",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    });

    it("maps moving a transaction to a cross-space account to INVALID_DESTINATION_ACCOUNT (42501)", async () => {
      activeClient = userA.client;
      const account = await financeApi.createAccount(
        mkAccount({ householdId: householdA, name: "Facade Cross-Space Source", type: "checking", openingBalanceCents: 5000 }),
      );
      expect(account.ok).toBe(true);
      if (!account.ok) return;

      const tx = await financeApi.recordTransaction(
        mkTx({
          householdId: householdA,
          accountId: account.value.id,
          categoryId: categoryA,
          kind: "expense",
          amountCents: 100,
          occurredOn: "2026-01-25",
        }),
      );
      expect(tx.ok).toBe(true);
      if (!tx.ok) return;

      // A real account belonging to household B, fetched via the admin client (fixture setup,
      // not the flow under test) so the id is real rather than a made-up UUID.
      const { data: bAccount } = await adminClient()
        .schema("finance")
        .from("accounts")
        .select("id")
        .eq("household_id", householdB)
        .limit(1)
        .maybeSingle();
      let crossSpaceAccountId = bAccount?.id as string | undefined;
      if (!crossSpaceAccountId) {
        activeClient = userB.client;
        const bAcc = await financeApi.createAccount(
          mkAccount({ householdId: householdB, name: "B Space Account", type: "cash" }),
        );
        expect(bAcc.ok).toBe(true);
        if (!bAcc.ok) return;
        crossSpaceAccountId = bAcc.value.id;
        activeClient = userA.client;
      }

      const moved = await financeApi.updateTransaction(tx.value.id, { accountId: crossSpaceAccountId });
      expect(moved.ok).toBe(false);
      if (!moved.ok) expect(moved.error.code).toBe("INVALID_DESTINATION_ACCOUNT");
    });

    it("maps editing a voided transaction to VOID_TRANSACTION_NOT_EDITABLE (22023)", async () => {
      activeClient = userA.client;
      const account = await financeApi.createAccount(
        mkAccount({ householdId: householdA, name: "Facade Void Test", type: "checking", openingBalanceCents: 5000 }),
      );
      expect(account.ok).toBe(true);
      if (!account.ok) return;

      const tx = await financeApi.recordTransaction(
        mkTx({
          householdId: householdA,
          accountId: account.value.id,
          categoryId: categoryA,
          kind: "expense",
          amountCents: 100,
          occurredOn: "2026-01-26",
        }),
      );
      expect(tx.ok).toBe(true);
      if (!tx.ok) return;

      const voided = await financeApi.voidTransactionById(tx.value.id, "facade test void");
      expect(voided.ok).toBe(true);

      const edited = await financeApi.updateTransaction(tx.value.id, { description: "resurrect me" });
      expect(edited.ok).toBe(false);
      if (!edited.ok) expect(edited.error.code).toBe("VOID_TRANSACTION_NOT_EDITABLE");
    });

    // change: finance-transaction-subtypes. Named regression for the shared 22023
    // disambiguation added in mapPgError: a sub-type/type mismatch must map to
    // INVALID_SUBTYPE_FOR_TYPE, and the void-lock case immediately above must keep mapping to
    // VOID_TRANSACTION_NOT_EDITABLE — neither may shadow the other now that both raise 22023
    // with a message-based dispatch.
    it("maps a mismatched subtype/type pairing to INVALID_SUBTYPE_FOR_TYPE (22023) on recordTransaction", async () => {
      activeClient = userA.client;
      const account = await financeApi.createAccount(
        mkAccount({ householdId: householdA, name: "Facade Subtype Test", type: "checking", openingBalanceCents: 5000 }),
      );
      expect(account.ok).toBe(true);
      if (!account.ok) return;

      // reembolso is income-only; forcing it onto an expense must trigger the pairing guard.
      const rejected = await financeApi.recordTransaction({
        ...mkTx({
          householdId: householdA,
          accountId: account.value.id,
          categoryId: categoryA,
          kind: "expense",
          amountCents: 100,
          occurredOn: "2026-01-27",
        }),
        subtype: "reembolso",
      });

      expect(rejected.ok).toBe(false);
      if (!rejected.ok) expect(rejected.error.code).toBe("INVALID_SUBTYPE_FOR_TYPE");
    });

    it("maps a mismatched subtype/type pairing to INVALID_SUBTYPE_FOR_TYPE (22023) on updateTransaction", async () => {
      activeClient = userA.client;
      const account = await financeApi.createAccount(
        mkAccount({ householdId: householdA, name: "Facade Subtype Edit Test", type: "checking", openingBalanceCents: 5000 }),
      );
      expect(account.ok).toBe(true);
      if (!account.ok) return;

      const tx = await financeApi.recordTransaction(
        mkTx({
          householdId: householdA,
          accountId: account.value.id,
          categoryId: categoryA,
          kind: "expense",
          amountCents: 100,
          occurredOn: "2026-01-28",
        }),
      );
      expect(tx.ok).toBe(true);
      if (!tx.ok) return;

      const edited = await financeApi.updateTransaction(tx.value.id, { subtype: "reembolso" });
      expect(edited.ok).toBe(false);
      if (!edited.ok) expect(edited.error.code).toBe("INVALID_SUBTYPE_FOR_TYPE");
    });
  });
});
