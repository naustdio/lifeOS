import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RTL, standard mode (tasks.md 5.5) — spec `recipes-video-reference` "A YouTube URL renders as an
// embed", "An unrecognized URL falls back to a link". `RecipeDetail.tsx` already exists (PR4);
// this proves the Phase 5 `VideoEmbed` wiring.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/supabase/server", () => ({ createClient: vi.fn() }));

const softDeleteRecipeAction = vi.fn();
const hardDeleteRecipeAction = vi.fn();
vi.mock("@/app/(app)/(recipes)/recetas/actions", () => ({ softDeleteRecipeAction, hardDeleteRecipeAction }));

const { RecipeDetail } = await import("@/app/(app)/(recipes)/recetas/[id]/RecipeDetail");

const BASE_RECIPE = {
  id: "r1",
  title: "Tacos al pastor",
  category: "comida" as const,
  portions: 4,
  ingredients: [],
  steps: [],
};

describe("RecipeDetail — video embed wiring (recipes-module Phase 5)", () => {
  afterEach(() => cleanup());

  it("a recognized-platform video URL renders an iframe, not a link", () => {
    render(
      <RecipeDetail
        recipe={{ ...BASE_RECIPE, videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }}
        history={[]}
        isOwner={false}
      />,
    );
    expect(screen.getByTitle("Tacos al pastor")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver video" })).not.toBeInTheDocument();
  });

  it("an unrecognized video URL renders a link, not an iframe", () => {
    render(
      <RecipeDetail recipe={{ ...BASE_RECIPE, videoUrl: "https://example.com/video.mp4" }} history={[]} isOwner={false} />,
    );
    expect(screen.getByRole("link", { name: "Ver video" })).toHaveAttribute("href", "https://example.com/video.mp4");
    expect(screen.queryByTitle("Tacos al pastor")).not.toBeInTheDocument();
  });

  it("a recipe with no video URL renders neither an iframe nor a link", () => {
    render(<RecipeDetail recipe={{ ...BASE_RECIPE, videoUrl: null }} history={[]} isOwner={false} />);
    expect(screen.queryByTitle("Tacos al pastor")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver video" })).not.toBeInTheDocument();
  });
});
