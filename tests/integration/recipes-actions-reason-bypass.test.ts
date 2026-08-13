// @vitest-environment node
//
// recipes-module Phase 3 (tasks.md 3.7/3.8) — calling the Server Actions directly (bypassing the
// rendered form entirely) with an empty/missing reason is rejected and writes no row. Spec
// `recipes-history` "A direct write bypassing the UI is still rejected".

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let activeClient: SupabaseClient;
vi.mock("@/shared/supabase/server", () => ({
  createClient: async () => activeClient,
}));

const actions = await import("@/app/(app)/(recipes)/recetas/actions");

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

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("recetas/actions — reason bypass rejected (recipes-module Phase 3)", () => {
  let householdId: string;

  beforeAll(async () => {
    const session = await signUpAndSignIn("recipes-reason-bypass");
    const space = await bootstrapSpace(session);
    householdId = space.householdId;
  }, 30000);

  it("createRecipeAction with an empty reason is rejected and writes no row", async () => {
    const result = await actions.createRecipeAction(
      { error: null },
      formData({ title: "Sin motivo", category: "comida", portions: "2", ingredients: "[]", steps: "[]", reason: "" }),
    );
    expect(result.error).not.toBeNull();

    const rows = await activeClient.schema("recipes").from("recipes").select("id").eq("household_id", householdId).eq("title", "Sin motivo");
    expect(rows.data).toEqual([]);
  });

  it("softDeleteRecipeAction with an empty reason is rejected", async () => {
    const create = await actions.createRecipeAction(
      { error: null },
      formData({ title: "Con motivo valido", category: "comida", portions: "2", ingredients: "[]", steps: "[]", reason: "carga inicial" }),
    );
    expect(create.error).toBeNull();

    const rows = await activeClient.schema("recipes").from("recipes").select("id").eq("household_id", householdId).eq("title", "Con motivo valido");
    const recipeId = rows.data?.[0]?.id as string;
    expect(recipeId).toBeTruthy();

    const result = await actions.softDeleteRecipeAction({ error: null }, formData({ id: recipeId, reason: "" }));
    expect(result.error).not.toBeNull();

    const stillActive = await activeClient.schema("recipes").from("recipes").select("is_deleted").eq("id", recipeId).single();
    expect(stillActive.data?.is_deleted).toBe(false);
  });
});
