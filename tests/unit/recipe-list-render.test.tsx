import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";

// RED-first (tasks.md 3.9, RTL, standard mode). Spec `recipes-catalog` "Searching by partial name
// returns matches", "Category filter narrows the list", "Search and filter compose on small
// viewports". `RecipeList.tsx` did not exist when this was written.

const { RecipeList } = await import("@/app/(app)/(recipes)/recetas/RecipeList");

const RECIPES = [
  { id: "1", title: "Tacos al pastor", category: "comida", portions: 4 },
  { id: "2", title: "Pastel de chocolate", category: "postre", portions: 8 },
  { id: "3", title: "Tacos de pescado", category: "comida", portions: 4 },
];

describe("RecipeList — smoke render (recipes-module)", () => {
  afterEach(() => cleanup());

  it("renders a name search input and category filter chips", () => {
    render(<RecipeList recipes={RECIPES} initialQuery="" initialCategory={null} />);
    expect(screen.getByLabelText("Buscar receta")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Comida" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Postre" })).toBeInTheDocument();
  });

  it("all three recipes render initially", () => {
    render(<RecipeList recipes={RECIPES} initialQuery="" initialCategory={null} />);
    expect(screen.getByText("Tacos al pastor")).toBeInTheDocument();
    expect(screen.getByText("Pastel de chocolate")).toBeInTheDocument();
    expect(screen.getByText("Tacos de pescado")).toBeInTheDocument();
  });

  it("typing in the search box narrows the rendered list by name", () => {
    render(<RecipeList recipes={RECIPES} initialQuery="" initialCategory={null} />);
    fireEvent.change(screen.getByLabelText("Buscar receta"), { target: { value: "pastor" } });

    expect(screen.getByText("Tacos al pastor")).toBeInTheDocument();
    expect(screen.queryByText("Pastel de chocolate")).not.toBeInTheDocument();
    expect(screen.queryByText("Tacos de pescado")).not.toBeInTheDocument();
  });

  it("clicking a category chip narrows the list, composing with an active search", () => {
    render(<RecipeList recipes={RECIPES} initialQuery="" initialCategory={null} />);
    fireEvent.change(screen.getByLabelText("Buscar receta"), { target: { value: "tacos" } });
    fireEvent.click(screen.getByRole("tab", { name: "Comida" }));

    expect(screen.getByText("Tacos al pastor")).toBeInTheDocument();
    expect(screen.getByText("Tacos de pescado")).toBeInTheDocument();
    expect(screen.queryByText("Pastel de chocolate")).not.toBeInTheDocument();
  });
});
