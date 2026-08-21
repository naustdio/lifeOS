// @vitest-environment node
//
// shopping-list module Phase 6 (tasks.md 6.6) — `planificador/actions.ts`'s `assignSlotAction` +
// `addSlotToListAction`, mirroring `tests/integration/shopping-list-generate-from-recipe.test.ts`'s
// mock-the-cookie-client pattern. Exercises the one genuinely new composition surface this slice
// adds (TDD Mode Assessment: "the two cross-module composition actions... since those are this
// change's only genuinely new interaction/logic surfaces").
//
// spec: `shopping-list-recipe-intake` "Weekly Planner Entry Point Is a Producer Only" both
// scenarios — adding from the planner writes into the SAME continuous list, and the planner does
// not create a second list system (exactly one active list exists per household after the add).

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let activeClient: SupabaseClient;
vi.mock("@/shared/supabase/server", () => ({
  createClient: async () => activeClient,
}));

const plannerActions = await import("@/app/(app)/(shopping-list)/planificador/actions");
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

describe("planificador/actions — assignSlotAction + addSlotToListAction (shopping-list Phase 6)", () => {
  let memberA: TestSession;
  let householdA: string;

  beforeAll(async () => {
    memberA = await signUpAndSignIn("shopping-planner-a");
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

  it("assigns a recipe to a day/meal slot and adding it feeds the SAME continuous list, keeping exactly one active list", async () => {
    activeClient = memberA.client;
    const recipeId = await createTestRecipe("Tacos al pastor", 4, "Piña", 100, "g");

    const assignResult = await plannerActions.assignSlotAction("lunes", "cena", recipeId);
    expect(assignResult.error).toBeNull();

    const slots = await shoppingApi.listPlannerSlots(memberA.client, householdA);
    const slot = slots.find((s) => s.day === "lunes" && s.mealSlot === "cena");
    expect(slot?.recipeId).toBe(recipeId);

    const listBeforeAdd = await shoppingApi.getOrCreateActiveList(memberA.client, householdA);
    expect(listBeforeAdd).not.toBeNull();

    const addResult = await plannerActions.addSlotToListAction("lunes", "cena");
    expect(addResult.error).toBeNull();

    // Same active list identity — the planner did not spin up a second list system.
    const listAfterAdd = await shoppingApi.getOrCreateActiveList(memberA.client, householdA);
    expect(listAfterAdd?.id).toBe(listBeforeAdd?.id);

    const items = await shoppingApi.listItems(memberA.client, listAfterAdd!.id);
    const added = items.find((i) => i.name === "Piña" && i.originRecipeId === recipeId);
    expect(added).toBeDefined();
    expect(added?.quantity).toBe(100); // default portions, unscaled
    expect(added?.originRecipeTitle).toBe("Tacos al pastor");
  });

  it("assigning a second recipe to the same slot replaces it rather than adding a second one", async () => {
    activeClient = memberA.client;
    const firstRecipeId = await createTestRecipe("Ensalada", 2, "Lechuga", 50, "g");
    const secondRecipeId = await createTestRecipe("Pasta", 2, "Pasta", 200, "g");

    await plannerActions.assignSlotAction("martes", "comida", firstRecipeId);
    await plannerActions.assignSlotAction("martes", "comida", secondRecipeId);

    const slots = await shoppingApi.listPlannerSlots(memberA.client, householdA);
    const matching = slots.filter((s) => s.day === "martes" && s.mealSlot === "comida");
    expect(matching).toHaveLength(1);
    expect(matching[0]?.recipeId).toBe(secondRecipeId);
  });
});
