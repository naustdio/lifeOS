// @vitest-environment node
//
// nutrition-submodule Phase 6 (tasks.md 6.1/6.2) — RED-first: seeds a visit with linked readings,
// a real Storage photo, and a posted Finance transaction, then calls `deleteNutritionVisitAction`
// and asserts the full delete contract (spec `health-events` "Deleting a nutrition visit unlinks
// its readings instead of deleting them" / "...deletes its photos"): readings survive with
// `event_id = null`, the photo row AND its real Storage object are gone, and the linked Finance
// transaction is voided, never hard-deleted.

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpAndSignIn, type TestSession } from "./helpers/local-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let activeClient: SupabaseClient;
vi.mock("@/shared/supabase/server", () => ({
  createClient: async () => activeClient,
}));

const actions = await import("@/app/(app)/(health)/nutricion/actions");
const healthApi = await import("@/modules/health/api");
const financeApi = await import("@/modules/finance/api");

async function bootstrapSpace(session: TestSession): Promise<{ householdId: string; accountId: string; categoryId: string }> {
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

  const { data: category, error: catErr } = await session.client
    .schema("finance")
    .from("categories")
    .select("id")
    .eq("household_id", household.id)
    .eq("kind", "expense")
    .limit(1)
    .single();
  if (catErr || !category) {
    throw new Error(`could not resolve a seeded expense category for ${session.email}: ${catErr?.message}`);
  }

  const account = await financeApi.createAccount({
    householdId: household.id as string,
    name: "Nutrition Visit Delete Test Account",
    type: "checking",
    openingBalanceCents: 0,
    visibility: "household",
    sortOrder: 0,
  });
  if (!account.ok) {
    throw new Error(`could not create test account: ${account.error.message}`);
  }

  return { householdId: household.id as string, accountId: account.value.id, categoryId: category.id as string };
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("nutricion/actions — delete flow (nutrition-submodule Phase 6)", () => {
  let householdId: string;
  let accountId: string;
  let categoryId: string;
  let userId: string;

  beforeAll(async () => {
    const session = await signUpAndSignIn("nutrition-visit-delete");
    userId = session.userId;
    const space = await bootstrapSpace(session);
    householdId = space.householdId;
    accountId = space.accountId;
    categoryId = space.categoryId;
  }, 30000);

  it("unlinks readings, deletes photos (row + Storage object), and voids the transaction", async () => {
    const create = await actions.createNutritionVisitAction(
      { error: null },
      formData({
        title: "Consulta a eliminar",
        occurredOn: "2026-08-11",
        visibility: "shared",
        hasCost: "on",
        accountId,
        categoryId,
        amount: "700.00",
      }),
    );
    expect(create.error).toBeNull();

    const events = await healthApi.listEvents(activeClient, householdId);
    const visit = events.find((e) => e.title === "Consulta a eliminar");
    expect(visit).toBeTruthy();
    const eventId = visit!.id;

    const { id: readingId, error: readingErr } = await healthApi.createVitalReading(activeClient, {
      householdId,
      ownerUserId: userId,
      metric: "weight_kg",
      valueNumeric: 82.4,
      eventId,
    });
    expect(readingErr).toBeNull();
    expect(readingId).toBeTruthy();

    const storagePath = `${userId}/${eventId}/${crypto.randomUUID()}.jpg`;
    const upload = await activeClient.storage
      .from(healthApi.NUTRITION_PHOTO_BUCKET)
      .upload(storagePath, new File([new Uint8Array([1, 2, 3])], "photo.jpg", { type: "image/jpeg" }));
    expect(upload.error).toBeNull();

    const { data: photoRow, error: photoInsertErr } = await activeClient
      .schema("health")
      .from("nutrition_visit_photos")
      .insert({ household_id: householdId, event_id: eventId, owner_user_id: userId, storage_path: storagePath })
      .select("id")
      .single();
    expect(photoInsertErr).toBeNull();
    const photoId = photoRow!.id as string;

    const beforeDelete = await financeApi.findByOrigin({ householdId, module: "health", entityId: eventId });
    expect(beforeDelete.ok && beforeDelete.value?.status).toBe("posted");

    const del = await actions.deleteNutritionVisitAction({ error: null }, formData({ id: eventId }));
    expect(del.error).toBeNull();

    const reading = await activeClient.schema("health").from("vital_readings").select("event_id").eq("id", readingId).single();
    expect(reading.data?.event_id).toBeNull();

    const photoRowAfter = await activeClient.schema("health").from("nutrition_visit_photos").select("id").eq("id", photoId);
    expect(photoRowAfter.data).toEqual([]);

    const objectAfter = await activeClient.storage.from(healthApi.NUTRITION_PHOTO_BUCKET).list(`${userId}/${eventId}`);
    expect((objectAfter.data ?? []).length).toBe(0);

    const afterDelete = await financeApi.findByOrigin({ householdId, module: "health", entityId: eventId });
    expect(afterDelete.ok && afterDelete.value?.status).toBe("void");
  });
});
