// @vitest-environment node
//
// shopping-list module Phase 5 (tasks.md 5.1/5.2) — `generateFromRecipesAction`, the first file
// in this change allowed to import BOTH `@/modules/recipes/api` and `@/modules/shopping-list/api`
// side by side (design.md Decision 3). RED-first: the action did not exist when this was written
// — MUST fail. Mirrors `tests/integration/shopping-list-actions.test.ts`'s mock-the-cookie-client
// pattern.
//
// spec: `shopping-list-recipe-intake` "Single-Recipe Entry Point With Portion-Scaling Prompt" both
// scenarios, "Multi-Select Entry Point From Recipe List".

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let activeClient: SupabaseClient;
vi.mock("@/shared/supabase/server", () => ({
  createClient: async () => activeClient,
}));

const actions = await import("@/app/(app)/(shopping-list)/lista-de-compras/actions");
const shoppingApi = await import("@/modules/shopping-list/api");
const recipesApi = await import("@/modules/recipes/api");

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

describe("lista-de-compras/actions — generateFromRecipesAction (shopping-list Phase 5)", () => {
  let memberA: TestSession;
  let householdA: string;

  beforeAll(async () => {
    memberA = await signUpAndSignIn("shopping-gen-recipe-a");
    householdA = await bootstrapSpace(memberA);
  }, 30000);

  async function createTestRecipe(title: string, portions: number, ingredientName: string, quantity: number, unit: string) {
    const { id, error } = await recipesApi.createRecipe(memberA.client, {
      householdId: householdA,
      title,
      category: "comida",
      portions,
      videoUrl: null,
      prepMinutes: null,
      description: null,
      ingredients: [{ position: 0, name: ingredientName, quantity, unit, subRecipeId: null, estimatedUnitCost: null }],
      steps: [{ position: 0, instruction: "Cocinar." }],
      reason: "test fixture",
    });
    expect(error).toBeNull();
    expect(id).not.toBeNull();
    return id as string;
  }

  it("scales an ingredient quantity to the requested target portions — 200@4→8=400", async () => {
    activeClient = memberA.client;
    const recipeId = await createTestRecipe("Pollo asado", 4, "Pollo", 200, "g");

    const result = await actions.generateFromRecipesAction({ recipeIds: [recipeId], targetPortions: 8 });
    expect(result.error).toBeNull();

    const list = await shoppingApi.getOrCreateActiveList(memberA.client, householdA);
    const items = await shoppingApi.listItems(memberA.client, list!.id);
    const added = items.find((i) => i.name === "Pollo" && i.originRecipeId === recipeId);
    expect(added).toBeDefined();
    expect(added?.quantity).toBe(400);
    expect(added?.originRecipeTitle).toBe("Pollo asado");
  });

  it("uses the recipe's own portions unscaled when the target equals the recipe's portions", async () => {
    activeClient = memberA.client;
    const recipeId = await createTestRecipe("Sopa de verduras", 4, "Zanahoria", 150, "g");

    const result = await actions.generateFromRecipesAction({ recipeIds: [recipeId], targetPortions: 4 });
    expect(result.error).toBeNull();

    const list = await shoppingApi.getOrCreateActiveList(memberA.client, householdA);
    const items = await shoppingApi.listItems(memberA.client, list!.id);
    const added = items.find((i) => i.name === "Zanahoria" && i.originRecipeId === recipeId);
    expect(added).toBeDefined();
    expect(added?.quantity).toBe(150);
  });

  it("adds items from two selected recipes in one call", async () => {
    activeClient = memberA.client;
    const recipeOneId = await createTestRecipe("Ensalada", 2, "Lechuga", 100, "g");
    const recipeTwoId = await createTestRecipe("Arroz", 2, "Arroz", 200, "g");

    const result = await actions.generateFromRecipesAction({ recipeIds: [recipeOneId, recipeTwoId], targetPortions: 2 });
    expect(result.error).toBeNull();

    const list = await shoppingApi.getOrCreateActiveList(memberA.client, householdA);
    const items = await shoppingApi.listItems(memberA.client, list!.id);
    expect(items.some((i) => i.name === "Lechuga" && i.originRecipeId === recipeOneId)).toBe(true);
    expect(items.some((i) => i.name === "Arroz" && i.originRecipeId === recipeTwoId)).toBe(true);
  });
});
