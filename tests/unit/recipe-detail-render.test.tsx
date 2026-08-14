import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RED-first (tasks.md 4.1/4.6, RTL, standard mode). Spec `recipes-history` "History is collapsed
// on page load", "Expanding history shows actor, timestamp, and reason per entry", "A non-owner
// does not see a hard-delete option in the UI". `RecipeDetail.tsx` did not exist when this was
// written.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const softDeleteRecipeAction = vi.fn();
const hardDeleteRecipeAction = vi.fn();
vi.mock("@/app/(app)/(recipes)/recetas/actions", () => ({ softDeleteRecipeAction, hardDeleteRecipeAction }));

const { RecipeDetail } = await import("@/app/(app)/(recipes)/recetas/[id]/RecipeDetail");

const RECIPE = {
  id: "r1",
  title: "Tacos al pastor",
  category: "comida" as const,
  portions: 4,
  videoUrl: null,
  prepMinutes: null,
  photoUrl: null,
  ingredients: [{ id: "i1", position: 0, name: "Tortilla", quantity: 8, unit: "pieza" }],
  steps: [{ id: "s1", position: 0, instruction: "Calentar la tortilla" }],
};

const HISTORY = [
  {
    id: "h1",
    recipeId: "r1",
    recipeTitle: "Tacos al pastor",
    actorUserId: "user-abc",
    action: "created" as const,
    reason: "primera carga de la receta",
    createdAt: "2026-08-01T12:00:00.000Z",
  },
];

describe("RecipeDetail — history + delete confirmations (recipes-module)", () => {
  afterEach(() => cleanup());

  it("renders the recipe title and a collapsed history toggle, hiding entries by default", () => {
    render(<RecipeDetail recipe={RECIPE} history={HISTORY} isOwner={false} />);
    expect(screen.getByText("Tacos al pastor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Historial de cambios" })).toBeInTheDocument();
    expect(screen.queryByText("primera carga de la receta")).not.toBeInTheDocument();
  });

  it("expanding history shows actor, timestamp, and reason per entry with no field-level diff", () => {
    render(<RecipeDetail recipe={RECIPE} history={HISTORY} isOwner={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Historial de cambios" }));

    expect(screen.getByText("primera carga de la receta")).toBeInTheDocument();
    expect(screen.getByText(/user-abc/)).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/título:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/campo/i)).not.toBeInTheDocument();
  });

  it("a non-owner sees only the soft-delete action, never hard-delete", () => {
    render(<RecipeDetail recipe={RECIPE} history={HISTORY} isOwner={false} />);
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar permanentemente" })).not.toBeInTheDocument();
  });

  it("an owner sees both the soft-delete and hard-delete actions", () => {
    render(<RecipeDetail recipe={RECIPE} history={HISTORY} isOwner={true} />);
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar permanentemente" })).toBeInTheDocument();
  });

  it("soft-delete confirmation is blocked client-side without a typed reason", () => {
    render(<RecipeDetail recipe={RECIPE} history={HISTORY} isOwner={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    const confirmButton = screen.getByRole("button", { name: "Confirmar borrado" });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Motivo del borrado"), { target: { value: "ya" } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Motivo del borrado"), { target: { value: "ya no la usamos" } });
    expect(confirmButton).not.toBeDisabled();
  });

  it("the hard-delete confirmation step is visibly distinct from the soft-delete confirmation", () => {
    render(<RecipeDetail recipe={RECIPE} history={HISTORY} isOwner={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar permanentemente" }));

    expect(screen.getByText(/esta acción no se puede deshacer/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí, eliminar permanentemente" })).toBeInTheDocument();
  });
});
