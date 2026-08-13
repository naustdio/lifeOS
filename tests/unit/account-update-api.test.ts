// Vitest — unit-level (no DB) regression pin for `finance/api`'s account-management seam
// functions (change: finance-account-edit T2.7): `updateAccount`, `setAccountArchived`,
// `deleteAccount`. Mirrors `tests/unit/account-api-class.test.ts`'s established pattern: the
// Supabase client is mocked, this is a pure regression pin on Zod validation, RPC param
// mapping, and error mapping — not a DB round trip (that's covered by
// tests/integration/finance-account-management.test.ts).

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

function fakeClient(rpcResult: RpcResult) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return { client: { schema: () => ({ rpc }) }, rpc };
}

let activeClient: unknown;
vi.mock("@/shared/supabase/server", () => ({
  createClient: async () => activeClient,
}));

const { updateAccount, setAccountArchived, deleteAccount } = await import("@/modules/finance/api");

const householdId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";

describe("updateAccount()", () => {
  it("rejects a liability update missing the liability detail block (Zod, no RPC call)", async () => {
    const { client, rpc } = fakeClient({ data: null, error: null });
    activeClient = client;
    const result = await updateAccount({
      accountId,
      householdId,
      name: "Retype",
      type: "liability",
    } as never);
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls finance.update_account with mapped params and returns the derived class for a well-formed input", async () => {
    const { client, rpc } = fakeClient({ data: null, error: null });
    activeClient = client;
    const result = await updateAccount({
      accountId,
      householdId,
      name: "Renamed",
      type: "liability",
      liability: {
        originalAmountCents: 100000,
        interestRateBp: 500,
        termMonths: 12,
        monthlyPaymentCents: 9000,
        startDate: "2026-01-01",
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.class).toBe("liability");
      expect(result.value.type).toBe("liability");
    }
    expect(rpc).toHaveBeenCalledWith(
      "update_account",
      expect.objectContaining({
        p_account_id: accountId,
        p_household_id: householdId,
        p_name: "Renamed",
        p_type: "liability",
        p_original_amount_cents: 100000,
      }),
    );
  });

  it("maps a 22023 RPC error to ACCOUNT_DETAIL_REQUIRED", async () => {
    const { client } = fakeClient({
      data: null,
      error: { code: "22023", message: "liability accounts require complete loan detail" },
    });
    activeClient = client;
    const result = await updateAccount({
      accountId,
      householdId,
      name: "Renamed",
      type: "cash",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ACCOUNT_DETAIL_REQUIRED");
    }
  });

  it("maps a P0002 RPC error to NOT_FOUND", async () => {
    const { client } = fakeClient({ data: null, error: { code: "P0002", message: "account not found in this household" } });
    activeClient = client;
    const result = await updateAccount({ accountId, householdId, name: "Renamed", type: "cash" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });
});

describe("setAccountArchived()", () => {
  it("calls finance.set_account_archived with p_archived=true", async () => {
    const { client, rpc } = fakeClient({ data: null, error: null });
    activeClient = client;
    const result = await setAccountArchived({ accountId, householdId, archived: true });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "set_account_archived",
      expect.objectContaining({ p_account_id: accountId, p_household_id: householdId, p_archived: true }),
    );
  });

  it("propagates a NOT_FOUND mapping for a cross-household id", async () => {
    const { client } = fakeClient({ data: null, error: { code: "P0002", message: "account not found in this household" } });
    activeClient = client;
    const result = await setAccountArchived({ accountId, householdId, archived: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });
});

describe("deleteAccount()", () => {
  it("calls finance.delete_account and succeeds when the RPC reports no error", async () => {
    const { client, rpc } = fakeClient({ data: null, error: null });
    activeClient = client;
    const result = await deleteAccount({ accountId, householdId });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "delete_account",
      expect.objectContaining({ p_account_id: accountId, p_household_id: householdId }),
    );
  });

  it("maps a 2BP01 RPC error to ACCOUNT_HAS_HISTORY", async () => {
    const { client } = fakeClient({ data: null, error: { code: "2BP01", message: "account has history and cannot be deleted" } });
    activeClient = client;
    const result = await deleteAccount({ accountId, householdId });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ACCOUNT_HAS_HISTORY");
    }
  });
});
