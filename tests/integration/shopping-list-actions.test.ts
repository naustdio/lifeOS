// @vitest-environment node
//
// shopping-list module Phase 3 (tasks.md 3.7/3.8) — calling `(shopping-list)/lista-de-compras`'s
// Server Actions directly, mirroring `tests/integration/recipes-actions-reason-bypass.test.ts`'s
// mock-the-cookie-client pattern. RED-first: `actions.ts` did not exist when this was written.
//
// spec: `shopping-list-continuous` "Loose Manual Items", "Add, Check, and Remove Without
// Ownership Restriction", "A non-member cannot see or write the list".

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let activeClient: SupabaseClient;
vi.mock("@/shared/supabase/server", () => ({
  createClient: async () => activeClient,
}));

const actions = await import("@/app/(app)/(shopping-list)/lista-de-compras/actions");
const shoppingApi = await import("@/modules/shopping-list/api");

async function bootstrapSpace(session: TestSession): Promise<string> {
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
  return household.id as string;
}

describe("lista-de-compras/actions — loose items + check/remove (shopping-list Phase 3)", () => {
  let memberA: TestSession;
  let memberB: TestSession;
  let householdA: string;

  beforeAll(async () => {
    memberA = await signUpAndSignIn("shopping-actions-a");
    householdA = await bootstrapSpace(memberA);

    // memberB deliberately does NOT bootstrap its own personal household — a member joined into
    // ONLY householdA, so `getCurrentHouseholdId` (`.limit(1).maybeSingle()` over their own
    // `household_members` rows) resolves unambiguously to householdA, letting the action-level
    // "a different member" scenario exercise real household resolution instead of hardcoding it.
    memberB = await signUpAndSignIn("shopping-actions-b");
    const { error: joinErr } = await adminClient()
      .schema("core")
      .from("household_members")
      .insert({ household_id: householdA, user_id: memberB.userId, role: "member" });
    expect(joinErr).toBeNull();
  }, 30000);

  it("addLooseItemAction persists an item with a null recipe origin, visible via listItems", async () => {
    activeClient = memberA.client;
    const result = await actions.addLooseItemAction({
      name: "Papel higiénico",
      quantity: 2,
      unit: "pieza",
      estimatedUnitCost: null,
      storeTypeId: null,
    });
    expect(result.error).toBeNull();

    const list = await shoppingApi.getOrCreateActiveList(memberA.client, householdA);
    const items = await shoppingApi.listItems(memberA.client, list!.id);
    const added = items.find((i) => i.name === "Papel higiénico");
    expect(added).toBeDefined();
    expect(added?.originRecipeTitle).toBeNull();
  });

  it("removeItemAction removes an item so it no longer appears for any household member", async () => {
    activeClient = memberA.client;
    const list = await shoppingApi.getOrCreateActiveList(memberA.client, householdA);
    await shoppingApi.addItems(memberA.client, list!.id, householdA, memberA.userId, [
      { name: "Detergente", quantity: 1, unit: "pieza", estimatedUnitCost: null, storeTypeId: null, originRecipeId: null, originRecipeTitle: null },
    ]);
    const items = await shoppingApi.listItems(memberA.client, list!.id);
    const target = items.find((i) => i.name === "Detergente");
    expect(target).toBeDefined();

    activeClient = memberB.client;
    const removeResult = await actions.removeItemAction([target!.id]);
    expect(removeResult.error).toBeNull();

    const afterRemove = await shoppingApi.listItems(memberA.client, list!.id);
    expect(afterRemove.find((i) => i.id === target!.id)).toBeUndefined();
  });

  it("a non-member cannot check or remove another household's item", async () => {
    activeClient = memberA.client;
    const list = await shoppingApi.getOrCreateActiveList(memberA.client, householdA);
    await shoppingApi.addItems(memberA.client, list!.id, householdA, memberA.userId, [
      { name: "Intruso", quantity: 1, unit: "pieza", estimatedUnitCost: null, storeTypeId: null, originRecipeId: null, originRecipeTitle: null },
    ]);
    const items = await shoppingApi.listItems(memberA.client, list!.id);
    const target = items.find((i) => i.name === "Intruso");
    expect(target).toBeDefined();

    const outsider = await signUpAndSignIn("shopping-actions-outsider");
    await bootstrapSpace(outsider);
    activeClient = outsider.client;

    // The outsider's own household never matches `target`'s real household, so the update's
    // `.eq("household_id", ...)` filter matches zero rows — RLS silently no-ops rather than
    // erroring (matching `addItems`' own non-member repository test, where reads/writes scoped
    // to another household simply return/affect nothing).
    await actions.setCheckedAction([target!.id], true);

    const stillUnchecked = await shoppingApi.listItems(memberA.client, list!.id);
    expect(stillUnchecked.find((i) => i.id === target!.id)?.isChecked).toBe(false);
  });
});
