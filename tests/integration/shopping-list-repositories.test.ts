// @vitest-environment node
//
// shopping-list module Phase 2 (tasks.md 2.5) — round-trip + RLS test for `shopping-list/data`'s
// repositories against the real local Supabase stack, mirroring
// `tests/integration/health-events-repository.test.ts`'s real-round-trip pattern. RED-first: none
// of `src/modules/shopping-list/{domain,data,api}` exists when this is written — MUST fail.
//
// spec: `shopping-list-continuous` "Single Continuous List Per Household", "A non-member cannot
// see or write the list"; design.md Decision 5 (explicit active/closed `lists` row).

import { beforeAll, describe, expect, it, vi } from "vitest";
import { adminClient, signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

vi.mock("server-only", () => ({}));

const shoppingApi = await import("@/modules/shopping-list/api");

async function bootstrapHousehold(session: TestSession): Promise<string> {
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

describe("shopping-list/data repositories — active list lifecycle + RLS (Phase 2)", () => {
  let memberA: TestSession;
  let memberB: TestSession;
  let householdA: string;

  beforeAll(async () => {
    memberA = await signUpAndSignIn("shopping-repo-a");
    householdA = await bootstrapHousehold(memberA);
    memberB = await signUpAndSignIn("shopping-repo-b");
    await bootstrapHousehold(memberB);
  }, 30000);

  it("getOrCreateActiveList creates once and reuses on a second read", async () => {
    const first = await shoppingApi.getOrCreateActiveList(memberA.client, householdA);
    expect(first).not.toBeNull();
    expect(first?.status).toBe("active");

    const second = await shoppingApi.getOrCreateActiveList(memberA.client, householdA);
    expect(second?.id).toBe(first?.id);
  });

  it("addItems + listItems round-trip, and finalizePurchase closes the list, stamps the total, and yields a NEW empty active list", async () => {
    const list = await shoppingApi.getOrCreateActiveList(memberA.client, householdA);
    expect(list).not.toBeNull();

    const { error: addErr } = await shoppingApi.addItems(memberA.client, list!.id, householdA, memberA.userId, [
      { name: "Manzana", quantity: 3, unit: "pieza", estimatedUnitCost: 5, storeTypeId: null, originRecipeId: null, originRecipeTitle: null },
      { name: "Pan", quantity: 1, unit: "pieza", estimatedUnitCost: null, storeTypeId: null, originRecipeId: null, originRecipeTitle: null },
    ]);
    expect(addErr).toBeNull();

    const items = await shoppingApi.listItems(memberA.client, list!.id);
    expect(items.map((i) => i.name).sort()).toEqual(["Manzana", "Pan"]);

    const { error: finalizeErr } = await shoppingApi.finalizePurchase(memberA.client, householdA, list!.id, memberA.userId);
    expect(finalizeErr).toBeNull();

    const nextList = await shoppingApi.getOrCreateActiveList(memberA.client, householdA);
    expect(nextList).not.toBeNull();
    expect(nextList?.id).not.toBe(list!.id);
    expect(nextList?.status).toBe("active");

    const nextItems = await shoppingApi.listItems(memberA.client, nextList!.id);
    expect(nextItems).toEqual([]);
  });

  it("a non-member cannot read or write another household's list or items", async () => {
    const listA = await shoppingApi.getOrCreateActiveList(memberA.client, householdA);
    expect(listA).not.toBeNull();

    // memberB reading householdA's list directly returns null (RLS, not app-level filtering).
    const asB = await memberB.client.schema("shopping_list").from("lists").select("id").eq("id", listA!.id).maybeSingle();
    expect(asB.data).toBeNull();

    const { error: addErr } = await shoppingApi.addItems(memberB.client, listA!.id, householdA, memberB.userId, [
      { name: "Intruso", quantity: 1, unit: "pieza", estimatedUnitCost: null, storeTypeId: null, originRecipeId: null, originRecipeTitle: null },
    ]);
    expect(addErr).not.toBeNull();
  });

  it("setChecked and removeItem are RLS-scoped and visible to every household member", async () => {
    // Runs AFTER the "non-member" test above, which relies on memberB being a genuine
    // non-member of householdA — promote memberB into householdA's real membership only now,
    // mirroring `tests/integration/health-events-repository.test.ts`'s admin-client join pattern
    // (no invite/accept RPC exists in this schema).
    const { error: joinErr } = await adminClient()
      .schema("core")
      .from("household_members")
      .insert({ household_id: householdA, user_id: memberB.userId, role: "member" });
    expect(joinErr).toBeNull();

    const list = await shoppingApi.getOrCreateActiveList(memberA.client, householdA);
    const { error: addErr } = await shoppingApi.addItems(memberA.client, list!.id, householdA, memberA.userId, [
      { name: "Cebolla", quantity: 1, unit: "pieza", estimatedUnitCost: null, storeTypeId: null, originRecipeId: null, originRecipeTitle: null },
    ]);
    expect(addErr).toBeNull();

    const [item] = await shoppingApi.listItems(memberA.client, list!.id);
    expect(item).toBeDefined();

    // memberB (same household) can check an item they didn't add — no ownership restriction.
    const { error: checkErr } = await shoppingApi.setChecked(memberB.client, householdA, item!.id, true);
    expect(checkErr).toBeNull();
    const afterCheck = await shoppingApi.listItems(memberA.client, list!.id);
    expect(afterCheck.find((i) => i.id === item!.id)?.isChecked).toBe(true);

    const { error: removeErr } = await shoppingApi.removeItem(memberB.client, householdA, item!.id);
    expect(removeErr).toBeNull();
    const afterRemove = await shoppingApi.listItems(memberA.client, list!.id);
    expect(afterRemove.find((i) => i.id === item!.id)).toBeUndefined();
  });

  it("ensureBaseStoreTypes seeds the base 4 idempotently, and a custom store type does not leak across households", async () => {
    await shoppingApi.ensureBaseStoreTypes(memberA.client, householdA);
    const firstList = await shoppingApi.listStoreTypes(memberA.client, householdA);
    await shoppingApi.ensureBaseStoreTypes(memberA.client, householdA);
    const secondList = await shoppingApi.listStoreTypes(memberA.client, householdA);
    expect(secondList.length).toBe(firstList.length);
    expect(secondList.map((s) => s.name).sort()).toEqual(
      ["Carnicería", "Cremería", "Mercado y Frutas y Verduras", "Supermercado"].sort(),
    );

    const { error: createErr } = await shoppingApi.createStoreType(memberA.client, householdA, "Panadería");
    expect(createErr).toBeNull();

    const householdB = await bootstrapHousehold(await signUpAndSignIn("shopping-repo-c"));
    const asOtherHousehold = await shoppingApi.listStoreTypes(memberA.client, householdB);
    expect(asOtherHousehold).toEqual([]);
  }, 30000);

  it("household ingredient store defaults resolve per lowercased name and stay scoped to the household", async () => {
    await shoppingApi.ensureBaseStoreTypes(memberA.client, householdA);
    const types = await shoppingApi.listStoreTypes(memberA.client, householdA);
    const supermercado = types.find((t) => t.name === "Supermercado");
    expect(supermercado).toBeDefined();

    const { error: setErr } = await shoppingApi.setIngredientDefault(memberA.client, householdA, "Jitomate", supermercado!.id);
    expect(setErr).toBeNull();

    const defaults = await shoppingApi.getIngredientDefaults(memberA.client, householdA, ["JITOMATE", "Cebolla"]);
    expect(defaults.get("jitomate")).toBe(supermercado!.id);
    expect(defaults.has("cebolla")).toBe(false);
  });
});

describe("shopping-list/data — non-member cannot see or write across all four tables (RLS)", () => {
  it("household B sees zero rows for household A's lists/items/store_types/defaults", async () => {
    const a = await signUpAndSignIn("shopping-repo-rls-a");
    const householdA = await bootstrapHousehold(a);
    const b = await signUpAndSignIn("shopping-repo-rls-b");
    await bootstrapHousehold(b);

    await shoppingApi.getOrCreateActiveList(a.client, householdA);
    await shoppingApi.ensureBaseStoreTypes(a.client, householdA);

    const listsAsB = await b.client.schema("shopping_list").from("lists").select("id").eq("household_id", householdA);
    expect(listsAsB.data).toEqual([]);
    const storeTypesAsB = await b.client.schema("shopping_list").from("store_types").select("id").eq("household_id", householdA);
    expect(storeTypesAsB.data).toEqual([]);
    const itemsAsB = await b.client.schema("shopping_list").from("items").select("id").eq("household_id", householdA);
    expect(itemsAsB.data).toEqual([]);
    const defaultsAsB = await b.client
      .schema("shopping_list")
      .from("ingredient_store_defaults")
      .select("ingredient_name")
      .eq("household_id", householdA);
    expect(defaultsAsB.data).toEqual([]);
  }, 30000);
});
