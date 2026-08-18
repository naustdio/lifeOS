import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import RecipesLayout from "@/app/(app)/(recipes)/layout";

// RTL approval render, mirrors `health-layout-nav-render.test.tsx` (tasks.md 2.6). Captures
// today's Recipes nav behavior BEFORE `(recipes)/layout.tsx` is refactored onto the shared
// registry + `ModuleNavPill` (change: tablet-web-sidebar-layout). Recipes has no overflow
// destinations — the "Más" trigger must not appear.
describe("RecipesLayout nav — approval render (registry + ModuleNavPill refactor)", () => {
  afterEach(() => cleanup());

  it("renders the direct Recetas link", () => {
    render(<RecipesLayout>{null}</RecipesLayout>);

    expect(screen.getByLabelText("Recetas")).toHaveAttribute("href", "/recetas");
  });

  it("renders the central FAB linking to /recetas with the Nueva receta accessible name", () => {
    render(<RecipesLayout>{null}</RecipesLayout>);

    expect(screen.getByRole("link", { name: "Nueva receta" })).toHaveAttribute(
      "href",
      "/recetas",
    );
    expect(screen.getByRole("button", { name: "Nueva receta" })).toBeInTheDocument();
  });

  it("renders no overflow trigger — Recipes has zero overflow destinations", () => {
    render(<RecipesLayout>{null}</RecipesLayout>);

    expect(screen.queryByRole("button", { name: /más|more/i })).not.toBeInTheDocument();
  });
});
