// @vitest-environment node
//
// recipes-module Phase 4 (tasks.md 4.4/4.5) — RED-first: proves the full stack enforces
// design.md Decision 2/3 end to end. (a) a non-owner member calling `hardDeleteRecipeAction` is
// rejected by the action's own role check, and the underlying RLS/seam rejects a non-owner even
// if the action check were bypassed (direct RPC call). (b) an owner's hard-delete removes the
// recipe row and its ingredient/step children, while the corresponding `recipe_changes` row
// survives with `recipe_id` null and the `household_id`/`recipe_title` snapshot intact. Spec
// `recipes-history` "A non-owner is blocked by RLS even bypassing the UI", "An owner can
// hard-delete behind confirmation".

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let activeClient: SupabaseClient;
vi.mock("@/shared/supabase/server", () => ({
  createClient: async () => activeClient,
}));

const actions = await import("@/app/(app)/(recipes)/recetas/actions");

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

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("hard-delete flow — owner-only, audit survives (recipes-module Phase 4)", () => {
  let owner: TestSession;
  let member: TestSession;
  let householdId: string;

  beforeAll(async () => {
    owner = await signUpAndSignIn("recipes-harddelete-owner");
    const space = await bootstrapSpace(owner);
    householdId = space.householdId;

    member = await signUpAndSignIn("recipes-harddelete-member");
    const { error: joinErr } = await adminClient()
      .schema("core")
      .from("household_members")
      .insert({ household_id: householdId, user_id: member.userId, role: "member" });
    if (joinErr) {
      throw new Error(`failed to add member to household: ${joinErr.message}`);
    }
  }, 30000);

  it("a non-owner is rejected both by the action's role check and by the RLS/seam if bypassed", async () => {
    activeClient = owner.client;
    const { data: recipeId, error: createErr } = await owner.client.schema("recipes").rpc("create_recipe", {
      p_household_id: householdId,
      p_title: "Receta de prueba (no-owner)",
      p_category: "comida",
      p_portions: 2,
      p_video_url: null,
      p_ingredients: [{ position: 0, name: "Sal", quantity: 1, unit: "pizca" }],
      p_steps: [{ position: 0, instruction: "Mezclar" }],
      p_reason: "carga inicial",
    });
    expect(createErr).toBeNull();
    expect(recipeId).toBeTruthy();

    activeClient = member.client;
    const actionResult = await actions.hardDeleteRecipeAction(
      { error: null },
      formData({ id: recipeId as string, reason: "no debería poder" }),
    );
    expect(actionResult.error).not.toBeNull();

    const { error: bypassErr } = await member.client.schema("recipes").rpc("hard_delete_recipe", {
      p_recipe_id: recipeId,
      p_reason: "bypass directo",
    });
    expect(bypassErr).not.toBeNull();
    expect(bypassErr?.message).toMatch(/42501|owner|permission/i);

    const stillThere = await owner.client.schema("recipes").from("recipes").select("id").eq("id", recipeId).eq("is_deleted", false);
    expect(stillThere.data).toHaveLength(1);
  }, 30000);

  it("an owner's hard-delete removes the recipe and its children while recipe_changes survives as a title-stamped orphan", async () => {
    activeClient = owner.client;
    const { data: recipeId, error: createErr } = await owner.client.schema("recipes").rpc("create_recipe", {
      p_household_id: householdId,
      p_title: "Receta de prueba (owner)",
      p_category: "postre",
      p_portions: 3,
      p_video_url: null,
      p_ingredients: [{ position: 0, name: "Harina", quantity: 2, unit: "taza" }],
      p_steps: [{ position: 0, instruction: "Hornear" }],
      p_reason: "carga inicial",
    });
    expect(createErr).toBeNull();
    expect(recipeId).toBeTruthy();

    const result = await actions.hardDeleteRecipeAction(
      { error: null },
      formData({ id: recipeId as string, reason: "eliminación permanente de prueba" }),
    );
    expect(result.error).toBeNull();

    const recipeRow = await owner.client.schema("recipes").from("recipes").select("id").eq("id", recipeId);
    expect(recipeRow.data).toEqual([]);

    const ingredientRows = await owner.client.schema("recipes").from("recipe_ingredients").select("id").eq("recipe_id", recipeId);
    expect(ingredientRows.data).toEqual([]);

    const stepRows = await owner.client.schema("recipes").from("recipe_steps").select("id").eq("recipe_id", recipeId);
    expect(stepRows.data).toEqual([]);

    const history = await owner.client
      .schema("recipes")
      .from("recipe_changes")
      .select("recipe_id, household_id, recipe_title, action, reason")
      .eq("household_id", householdId)
      .eq("recipe_title", "Receta de prueba (owner)")
      .order("created_at", { ascending: true });

    expect(history.data?.map((h) => h.action)).toEqual(["created", "hard_deleted"]);
    const hardDeletedRow = history.data?.find((h) => h.action === "hard_deleted");
    expect(hardDeletedRow?.recipe_id).toBeNull();
    expect(hardDeletedRow?.household_id).toBe(householdId);
    expect(hardDeletedRow?.reason).toBe("eliminación permanente de prueba");
  }, 30000);
});
