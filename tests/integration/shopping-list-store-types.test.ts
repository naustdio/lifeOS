// @vitest-environment node
//
// shopping-list module Phase 4 (tasks.md 4.4) — `lista-de-compras/actions.ts`'s
// `createStoreTypeAction` wiring, mirroring `tests/integration/shopping-list-actions.test.ts`'s
// mock-the-cookie-client pattern. RED-first: `createStoreTypeAction` did not exist when this was
// written — MUST fail.
//
// `ensureBaseStoreTypes`/`createStoreType`/household-scoping repository behavior is already
// covered end-to-end by Phase 2's `tests/integration/shopping-list-repositories.test.ts`
// ("ensureBaseStoreTypes seeds the base 4 idempotently, and a custom store type does not leak
// across households") — re-testing those exact repository functions here would not be a valid RED
// test. This file exercises ONLY the new app-layer action added in this slice.
//
// spec: `shopping-list-store-types` "A member creates a custom store type".

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

describe("lista-de-compras/actions — createStoreTypeAction (shopping-list Phase 4)", () => {
  let memberA: TestSession;
  let householdA: string;

  beforeAll(async () => {
    memberA = await signUpAndSignIn("shopping-store-types-a");
    householdA = await bootstrapSpace(memberA);
  }, 30000);

  it("creates a custom store type and it becomes selectable via listStoreTypes — spec 'A member creates a custom store type'", async () => {
    activeClient = memberA.client;
    const result = await actions.createStoreTypeAction("Panadería");
    expect(result.error).toBeNull();
    expect(result.storeType).not.toBeNull();
    expect(result.storeType?.name).toBe("Panadería");

    const types = await shoppingApi.listStoreTypes(memberA.client, householdA);
    expect(types.some((t) => t.id === result.storeType?.id && t.name === "Panadería")).toBe(true);
  });

  it("resolves the created row's id even though the repository's createStoreType only returns {error}", async () => {
    activeClient = memberA.client;
    const result = await actions.createStoreTypeAction("Ferretería");
    expect(result.error).toBeNull();
    expect(typeof result.storeType?.id).toBe("string");
    expect(result.storeType?.id.length).toBeGreaterThan(0);
  });
});
