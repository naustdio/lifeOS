// @vitest-environment node
//
// sdd-verify WARNING-3 (nutrition-submodule): `addVisitMetricsAction` — the sole path left for
// completing a LEGACY zero-metric nutrition visit after the "add metrics to an already-complete
// visit" form was removed (live-testing feedback) — had zero test coverage. Spec
// `health-nutrition-visits` "Legacy Pre-Change Nutrition Events Are Visible as Completable
// Visits": a pre-existing nutrition event with no linked readings must be completable by linking
// new readings to its `event_id`.

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

describe("nutricion/actions — addVisitMetricsAction completes a legacy visit (nutrition-submodule)", () => {
  let householdId: string;
  let userId: string;

  beforeAll(async () => {
    const session = await signUpAndSignIn("nutrition-legacy-complete");
    userId = session.userId;
    const space = await bootstrapSpace(session);
    householdId = space.householdId;
  }, 30000);

  it("links new readings to a pre-existing zero-metric nutrition event", async () => {
    // Simulates a "legacy" event: created directly (as `/salud` would have, before `/nutricion`
    // existed), with no linked readings.
    const { id: eventId, error: createErr } = await healthApi.createEvent(activeClient, {
      householdId,
      ownerUserId: userId,
      eventType: "nutrition",
      title: "Consulta legado",
      occurredOn: "2024-02-12",
    });
    expect(createErr).toBeNull();
    expect(eventId).toBeTruthy();

    const before = await healthApi.listVitalReadings(activeClient, householdId, undefined, { eventId: eventId! });
    expect(before).toHaveLength(0);

    const result = await actions.addVisitMetricsAction(
      { error: null },
      formData({ eventId: eventId!, measuredOn: "2024-02-12", metric_weight_kg: "82.5", metric_body_fat_pct: "18" }),
    );
    expect(result.error).toBeNull();

    const after = await healthApi.listVitalReadings(activeClient, householdId, undefined, { eventId: eventId! });
    expect(after).toHaveLength(2);
    expect(after.every((r) => r.eventId === eventId)).toBe(true);
    expect(after.find((r) => r.metric === "weight_kg")?.valueNumeric).toBe(82.5);
  });

  it("rejects linking metrics to a non-nutrition event", async () => {
    const { id: eventId, error: createErr } = await healthApi.createEvent(activeClient, {
      householdId,
      ownerUserId: userId,
      eventType: "consultation",
      title: "Consulta médica",
      occurredOn: "2026-08-11",
    });
    expect(createErr).toBeNull();

    const result = await actions.addVisitMetricsAction(
      { error: null },
      formData({ eventId: eventId!, measuredOn: "2026-08-11", metric_weight_kg: "80" }),
    );
    expect(result.error).not.toBeNull();
  });
});
