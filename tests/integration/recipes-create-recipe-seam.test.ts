// @vitest-environment node
//
// recipes-module Phase 2 (tasks.md 2.5/2.9/2.11/2.12) — RED-first: proves the write-seam's
// atomicity (a blank reason writes NO recipe row at all, not just a rejected recipe_changes
// insert) and that soft-delete removes a recipe from listRecipes while its history survives.
// Extended (2.11/2.12) with cross-household isolation for listRecipes and listCustomUnits.

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

vi.mock("server-only", () => ({}));

let activeClient: SupabaseClient;

async function bootstrapSpace(session: TestSession): Promise<{ householdId: string }> {
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

  return { householdId: household.id as string };
}

describe("recipes seam — atomicity and soft-delete (recipes-module Phase 2)", () => {
  let householdId: string;

  beforeAll(async () => {
    const session = await signUpAndSignIn("recipes-seam");
    const space = await bootstrapSpace(session);
    householdId = space.householdId;
  }, 30000);

  it("a blank reason writes no recipe row at all (seam atomicity)", async () => {
    const before = await activeClient
      .schema("recipes")
      .from("recipes")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId);

    const { error } = await activeClient.schema("recipes").rpc("create_recipe", {
      p_household_id: householdId,
      p_title: "Debe fallar",
      p_category: "comida",
      p_portions: 2,
      p_video_url: null,
      p_ingredients: [],
      p_steps: [],
      p_reason: "",
    });
    expect(error).not.toBeNull();

    const after = await activeClient
      .schema("recipes")
      .from("recipes")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId);

    expect(after.count).toBe(before.count ?? 0);
  });

  it("soft delete removes the recipe from a normal listing while its history remains readable", async () => {
    const { data: recipeId, error: createErr } = await activeClient.schema("recipes").rpc("create_recipe", {
      p_household_id: householdId,
      p_title: "Sopa de lentejas",
      p_category: "comida",
      p_portions: 4,
      p_video_url: null,
      p_ingredients: [{ position: 0, name: "Lentejas", quantity: 2, unit: "taza" }],
      p_steps: [{ position: 0, instruction: "Remojar las lentejas" }],
      p_reason: "primera carga",
    });
    expect(createErr).toBeNull();
    expect(recipeId).toBeTruthy();

    const { error: deleteErr } = await activeClient.schema("recipes").rpc("soft_delete_recipe", {
      p_recipe_id: recipeId,
      p_reason: "receta duplicada",
    });
    expect(deleteErr).toBeNull();

    const listed = await activeClient
      .schema("recipes")
      .from("recipes")
      .select("id")
      .eq("id", recipeId)
      .eq("is_deleted", false);
    expect(listed.data).toEqual([]);

    const history = await activeClient
      .schema("recipes")
      .from("recipe_changes")
      .select("action, reason")
      .eq("recipe_id", recipeId)
      .order("created_at", { ascending: true });
    expect(history.data?.map((h) => h.action)).toEqual(["created", "soft_deleted"]);
  });
});

describe("recipes — cross-household isolation (recipes-module Phase 2, tasks.md 2.11/2.12)", () => {
  it("a non-member cannot read another household's recipes or custom_units", async () => {
    const sessionA = await signUpAndSignIn("recipes-isolation-a");
    const spaceA = await bootstrapSpace(sessionA);

    await sessionA.client.schema("recipes").rpc("create_recipe", {
      p_household_id: spaceA.householdId,
      p_title: "Receta privada de A",
      p_category: "postre",
      p_portions: 1,
      p_video_url: null,
      p_ingredients: [{ position: 0, name: "Azucar", quantity: 1, unit: "rebanadita" }],
      p_steps: [],
      p_reason: "carga inicial",
    });

    const sessionB = await signUpAndSignIn("recipes-isolation-b");
    await bootstrapSpace(sessionB);

    const recipesAsB = await sessionB.client
      .schema("recipes")
      .from("recipes")
      .select("id")
      .eq("household_id", spaceA.householdId);
    expect(recipesAsB.data).toEqual([]);

    const customUnitsAsB = await sessionB.client
      .schema("recipes")
      .from("custom_units")
      .select("unit_name")
      .eq("household_id", spaceA.householdId);
    expect(customUnitsAsB.data).toEqual([]);
  }, 30000);
});
