// Vitest — unit-level (no DB) regression pin for `finance/api/index.ts` site (f) (design.md §3,
// tasks.md A-010): `createAccount()`'s returned `class` must be 'asset' for both new types (the
// inline `deriveAccountClass(i.type)` computation, not the old two-way ternary), and
// `updateInvestmentValue()` must map a `22023` error through `mapPgError` the same way
// `createAccount` does. The Supabase client is mocked — this is a pure regression pin on the
// TS-side class computation and error mapping, not a DB round trip (that's covered by pgTAP and
// tests/integration/account-creation-ui.test.ts).

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

function fakeClient(rpcResult: RpcResult) {
  return {
    schema: () => ({
      rpc: vi.fn().mockResolvedValue(rpcResult),
    }),
  };
}

let activeClient: unknown;
vi.mock("@/shared/supabase/server", () => ({
  createClient: async () => activeClient,
}));

const { createAccount, updateInvestmentValue } = await import("@/modules/finance/api");

const householdId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";

describe("createAccount() — class computation (site f) for the two new types", () => {
  it("returns class='asset' for a well-formed investment account", async () => {
    activeClient = fakeClient({ data: accountId, error: null });
    const result = await createAccount({
      householdId,
      name: "Acciones",
      type: "investment",
      investment: { costBasisCents: 100000 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.class).toBe("asset");
      expect(result.value.type).toBe("investment");
    }
  });

  it("returns class='asset' for a well-formed loaned account", async () => {
    activeClient = fakeClient({ data: accountId, error: null });
    const result = await createAccount({
      householdId,
      name: "Prestado",
      type: "loaned",
      loaned: { counterpartyName: "Juan", originalAmountCents: 5000 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.class).toBe("asset");
      expect(result.value.type).toBe("loaned");
    }
  });
});

describe("updateInvestmentValue() — mapPgError, same shape as createAccount", () => {
  it("maps a 22023 RPC error to ACCOUNT_DETAIL_REQUIRED, the same code createAccount maps 22023 to", async () => {
    activeClient = fakeClient({ data: null, error: { code: "22023", message: "only investment accounts can have their current value updated" } });
    const result = await updateInvestmentValue({ householdId, accountId, currentValueCents: 1000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ACCOUNT_DETAIL_REQUIRED");
    }
  });

  it("succeeds when the RPC reports no error", async () => {
    activeClient = fakeClient({ data: null, error: null });
    const result = await updateInvestmentValue({ householdId, accountId, currentValueCents: 1000 });
    expect(result.ok).toBe(true);
  });
});
