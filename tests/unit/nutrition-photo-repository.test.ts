import { describe, expect, it } from "vitest";
import { buildPhotoPath, NUTRITION_PHOTO_BUCKET } from "@/modules/health/data/nutrition-photo-repository";

// RED-first (tasks.md 2.3) — `nutrition-photo-repository.ts` did not exist when this was written;
// this import alone fails until 2.4 creates it. Spec `health-privacy` "A direct signed-URL
// request for another member's photo is denied" depends on the object path always being prefixed
// by the real owner, never a caller-supplied prefix — `buildPhotoPath` is the single place that
// shape is decided, so it is tested in isolation as a pure function.
describe("buildPhotoPath (nutrition-submodule)", () => {
  const ownerUserId = "11111111-1111-1111-1111-111111111111";
  const eventId = "22222222-2222-2222-2222-222222222222";

  it("prefixes the path with the owner user id, then the event id", () => {
    const path = buildPhotoPath(ownerUserId, eventId, "jpg");
    expect(path.startsWith(`${ownerUserId}/${eventId}/`)).toBe(true);
  });

  it("keeps the given extension on the generated filename", () => {
    const path = buildPhotoPath(ownerUserId, eventId, "webp");
    expect(path.endsWith(".webp")).toBe(true);
  });

  it("generates a distinct filename per call, so two uploads never collide", () => {
    const a = buildPhotoPath(ownerUserId, eventId, "png");
    const b = buildPhotoPath(ownerUserId, eventId, "png");
    expect(a).not.toBe(b);
  });

  it("exports the fixed private bucket name used by the migration", () => {
    expect(NUTRITION_PHOTO_BUCKET).toBe("health-nutrition-photos");
  });
});
