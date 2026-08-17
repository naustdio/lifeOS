"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/design-system/ui/button";
import type { IngredientCatalogOption, IngredientRowRecipeOption, IngredientRowUnitOption } from "@/design-system/patterns/IngredientRow";
import { RecipeForm } from "./RecipeForm";

/**
 * Entry point for creating a recipe (UI-polish fast-follow): the list page no longer keeps
 * "Nueva receta" permanently expanded — a "Nueva receta" button opens it in a dismissible modal
 * (same `fixed inset-0` backdrop-over-`Card` shape as `OverBudgetDialog`, this codebase's only
 * prior modal). Closes itself on a successful create (`RecipeForm`'s `onCreated`) or on backdrop/X
 * click; the list behind it re-renders from `revalidatePath` either way.
 */
export function NewRecipeLauncher({
  units,
  catalog,
  recipeOptions,
}: {
  units: IngredientRowUnitOption[];
  catalog: IngredientCatalogOption[];
  recipeOptions: IngredientRowRecipeOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" className="w-full justify-center gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Nueva receta
      </Button>

      {open && (
        <div
          // z-[60]: above the bottom `nav-pill` (`z-50`, and later in the DOM so it would
          // otherwise win the stacking tie) — without this the pill sits on top of the modal and
          // covers "Guardar receta". pb-24 keeps the save button clear of the pill even while
          // scrolled to the bottom.
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pb-24 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="my-8 w-full max-w-lg">
            <RecipeForm
              mode="create"
              units={units}
              catalog={catalog}
              recipeOptions={recipeOptions}
              onClose={() => setOpen(false)}
              onCreated={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
