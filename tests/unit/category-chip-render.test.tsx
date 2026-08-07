import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CategoryChip } from "@/design-system/patterns/CategoryChip";

/**
 * RTL coverage for CategoryChip's fallback-safe resolution of stored icon/color keys (design.md
 * §3, change: finance-categories-icon-color C-008/C-009). RED-first: this test is written
 * before CategoryChip accepts `iconKey`/`colorKey` and must fail against the old
 * `icon?: LucideIcon` signature.
 */
describe("CategoryChip", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the resolved icon and semantic color classes for a known key pair", () => {
    render(<CategoryChip name="Comida" iconKey="utensils" colorKey="orange" />);
    expect(screen.getByText("Comida")).toBeInTheDocument();
    const bubble = screen.getByText("Comida").querySelector("span");
    expect(bubble).toBeTruthy();
    expect(bubble?.className).toContain("bg-category-orange-surface");
    const icon = bubble?.querySelector("svg");
    expect(icon).toBeTruthy();
    expect(icon?.getAttribute("class")).toContain("text-category-orange");
  });

  it("renders the fallback icon and fallback color with no crash and no blank chip when both keys are null", () => {
    render(<CategoryChip name="Sin estilo" iconKey={null} colorKey={null} />);
    expect(screen.getByText("Sin estilo")).toBeInTheDocument();
    const bubble = screen.getByText("Sin estilo").querySelector("span");
    expect(bubble).toBeTruthy();
    expect(bubble?.className).toContain("bg-muted");
    const icon = bubble?.querySelector("svg");
    expect(icon).toBeTruthy();
  });

  it("renders the fallback icon and fallback color for an unknown/retired key, never throwing", () => {
    expect(() =>
      render(<CategoryChip name="Retirado" iconKey="not-a-real-icon" colorKey="not-a-real-color" />),
    ).not.toThrow();
    const bubble = screen.getByText("Retirado").querySelector("span");
    expect(bubble?.className).toContain("bg-muted");
    expect(bubble?.querySelector("svg")).toBeTruthy();
  });
});
