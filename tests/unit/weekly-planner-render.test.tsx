import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";

// RED-first (tasks.md 6.4, RTL, strict TDD). Spec `shopping-list-recipe-intake` "Weekly Planner
// Entry Point Is a Producer Only" both scenarios. `WeeklyPlanner.tsx` does not exist when this is
// written — MUST fail.

const { WeeklyPlanner } = await import("@/app/(app)/(shopping-list)/planificador/WeeklyPlanner");

function noopAssign(): (day: string, mealSlot: string, recipeId: string) => Promise<{ error: string | null }> {
  return async () => ({ error: null });
}

function noopAddToList(): (day: string, mealSlot: string) => Promise<{ error: string | null }> {
  return async () => ({ error: null });
}

const recipes = [
  { id: "r1", title: "Pollo asado" },
  { id: "r2", title: "Sopa de verduras" },
];

describe("WeeklyPlanner — smoke render (shopping-list Phase 6)", () => {
  afterEach(() => cleanup());

  it("assigns at most one recipe per day/meal slot — no duplicate rendering of the same assignment", () => {
    render(
      <WeeklyPlanner
        assignments={[{ day: "lunes", mealSlot: "cena", recipeId: "r1", recipeTitle: "Pollo asado" }]}
        recipes={recipes}
        onAssign={noopAssign()}
        onAddToList={noopAddToList()}
      />,
    );

    // Exactly one occurrence of the assigned recipe's title across the whole grid.
    expect(screen.getAllByText("Pollo asado")).toHaveLength(1);
  });

  it('exposes "Agregar a mi lista" exactly once per assignment, and not for empty slots', () => {
    render(
      <WeeklyPlanner
        assignments={[
          { day: "lunes", mealSlot: "cena", recipeId: "r1", recipeTitle: "Pollo asado" },
          { day: "martes", mealSlot: "comida", recipeId: "r2", recipeTitle: "Sopa de verduras" },
        ]}
        recipes={recipes}
        onAssign={noopAssign()}
        onAddToList={noopAddToList()}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Agregar a mi lista" })).toHaveLength(2);
  });
});
