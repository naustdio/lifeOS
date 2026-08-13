import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RED-first (tasks.md 3.4) — spec `recipes-history` "A UI edit without a reason is blocked".
// `RecipeForm.tsx` did not exist when this was written.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const createRecipeAction = vi.fn();
const updateRecipeAction = vi.fn();
vi.mock("@/app/(app)/(recipes)/recetas/actions", () => ({ createRecipeAction, updateRecipeAction }));

const { RecipeForm } = await import("@/app/(app)/(recipes)/recetas/RecipeForm");

const UNITS = [
  { value: "g", label: "Gramo (g)", icon: "⚖️" },
  { value: "taza", label: "Taza", icon: "☕" },
];

describe("RecipeForm — smoke render (recipes-module)", () => {
  afterEach(() => {
    cleanup();
    createRecipeAction.mockReset();
    updateRecipeAction.mockReset();
  });

  it("renders title, category, portions, video url, and reason fields", () => {
    render(<RecipeForm mode="create" units={UNITS} />);

    expect(screen.getByLabelText("Título")).toBeInTheDocument();
    expect(screen.getByLabelText("Categoría")).toBeInTheDocument();
    expect(screen.getByLabelText("Porciones")).toBeInTheDocument();
    expect(screen.getByLabelText(/Video/)).toBeInTheDocument();
    expect(screen.getByLabelText("Motivo")).toBeInTheDocument();
  });

  it("blocks submit and shows a validation message when the reason is empty", () => {
    render(<RecipeForm mode="create" units={UNITS} />);

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Tacos" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar receta/ }));

    expect(screen.getByText(/motivo/i)).toBeInTheDocument();
  });

  it("can add and remove ingredient and step rows", () => {
    render(<RecipeForm mode="create" units={UNITS} />);

    fireEvent.click(screen.getByRole("button", { name: "Agregar ingrediente" }));
    expect(screen.getByLabelText("Ingrediente")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Agregar paso" }));
    expect(screen.getByPlaceholderText("Paso 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Quitar ingrediente 1" }));
    expect(screen.queryByLabelText("Ingrediente")).not.toBeInTheDocument();
  });
});
