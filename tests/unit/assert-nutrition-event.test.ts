import { describe, expect, it, vi } from "vitest";

// RED-first (tasks.md 4.1) — `nutricion/actions.ts` did not exist when this was written. Spec
// `health-nutrition-visits` "`/nutricion` Is the Sole Creation Path for Visits" depends on this
// single choke point rejecting any event_id that isn't actually a nutrition-type event, since
// `/nutricion` is the only place the vital_readings/nutrition_visit_photos `event_id` link gets
// created (design.md Decision 2 — app-layer validation only, no DB trigger).

vi.mock("server-only", () => ({}));

describe("assertNutritionEvent (nutrition-submodule)", () => {
  it("rejects an event of type consultation", async () => {
    const { assertNutritionEvent } = await import("@/app/(app)/(health)/nutricion/actions");
    const supabase = {} as never;
    const getEventById = vi.fn().mockResolvedValue({ id: "e1", eventType: "consultation" });

    const result = await assertNutritionEvent(supabase, "household-1", "e1", getEventById);
    expect(result.ok).toBe(false);
  });

  it("rejects an event of type study", async () => {
    const { assertNutritionEvent } = await import("@/app/(app)/(health)/nutricion/actions");
    const supabase = {} as never;
    const getEventById = vi.fn().mockResolvedValue({ id: "e1", eventType: "study" });

    const result = await assertNutritionEvent(supabase, "household-1", "e1", getEventById);
    expect(result.ok).toBe(false);
  });

  it("accepts an event of type nutrition", async () => {
    const { assertNutritionEvent } = await import("@/app/(app)/(health)/nutricion/actions");
    const supabase = {} as never;
    const event = { id: "e1", eventType: "nutrition" };
    const getEventById = vi.fn().mockResolvedValue(event);

    const result = await assertNutritionEvent(supabase, "household-1", "e1", getEventById);
    expect(result.ok).toBe(true);
    expect(result.ok && result.event).toBe(event);
  });

  it("rejects when the event does not exist", async () => {
    const { assertNutritionEvent } = await import("@/app/(app)/(health)/nutricion/actions");
    const supabase = {} as never;
    const getEventById = vi.fn().mockResolvedValue(null);

    const result = await assertNutritionEvent(supabase, "household-1", "missing", getEventById);
    expect(result.ok).toBe(false);
  });
});
