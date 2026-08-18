import { describe, expect, it } from "vitest";
import { resolveActiveHref } from "@/shared/navigation/active-route";

/**
 * Unit tests for the longest-prefix active-route resolver (change:
 * tablet-web-sidebar-layout, design.md Testing Strategy). Pure function —
 * no mocks needed. Colocated in `tests/unit/` rather than
 * `src/shared/navigation/` because `vitest.config.ts`'s `test.include` only
 * globs `tests/unit/**` and `tests/integration/**` (deviation from tasks.md
 * 1.1's literal colocated path — see apply-progress).
 */
describe("resolveActiveHref", () => {
  it("matches a nested route to its module href via longest prefix", () => {
    expect(
      resolveActiveHref("/movimientos/1/edit", ["/finance", "/movimientos", "/salud"]),
    ).toBe("/movimientos");
  });

  it("returns null for the hub route with no module match", () => {
    expect(resolveActiveHref("/", ["/finance", "/salud", "/recetas"])).toBeNull();
  });

  it("returns null for an unknown route with no matching href", () => {
    expect(resolveActiveHref("/unknown-route", ["/finance", "/salud"])).toBeNull();
  });

  it("picks the longest of two overlapping prefixes", () => {
    expect(resolveActiveHref("/salud/nutricion", ["/salud", "/salud/nutricion"])).toBe(
      "/salud/nutricion",
    );
  });
});
