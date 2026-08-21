import { getCurrentHouseholdId } from "@/modules/core/api";
import { listRecipes } from "@/modules/recipes/api";
import { listPlannerSlots, PLANNER_DAYS, PLANNER_MEAL_SLOTS, type PlannerDay, type PlannerMealSlot } from "@/modules/shopping-list/api";
import { createClient } from "@/shared/supabase/server";
import { addSlotToListAction, assignSlotAction } from "./actions";
import { WeeklyPlanner, type WeeklyPlannerAssignment } from "./WeeklyPlanner";

function isPlannerDay(v: string): v is PlannerDay {
  return (PLANNER_DAYS as readonly string[]).includes(v);
}
function isPlannerMealSlot(v: string): v is PlannerMealSlot {
  return (PLANNER_MEAL_SLOTS as readonly string[]).includes(v);
}

/**
 * Server container for `/planificador` (design.md File Changes, tasks.md 6.5). Reads
 * `planner_slots` (shopping-list module) and the household's recipes (recipes module) side by
 * side, joining them here at the app layer — same cross-module composition pattern as
 * `lista-de-compras/page.tsx` + `actions.ts` (Decision 3), never inside a module's `api`.
 */
export default async function PlanificadorPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);

  const [slots, recipeList] = spaceId
    ? await Promise.all([listPlannerSlots(supabase, spaceId), listRecipes(supabase, spaceId)])
    : [[], []];

  const recipesById = new Map(recipeList.map((r) => [r.id, r.title]));
  const assignments: WeeklyPlannerAssignment[] = slots
    .map((slot) => ({
      day: slot.day,
      mealSlot: slot.mealSlot,
      recipeId: slot.recipeId,
      recipeTitle: recipesById.get(slot.recipeId) ?? "Receta eliminada",
    }))
    .filter((a) => recipesById.has(a.recipeId));

  // Adapters: `WeeklyPlanner` is a client component with locally-declared `string` prop types (it
  // cannot import `@/modules/shopping-list/api`'s `PlannerDay`/`PlannerMealSlot` literal unions
  // across the `server-only` barrier), so narrow back to those unions here before delegating to
  // the Server Actions, which are typed against the real domain literals.
  async function onAssign(day: string, mealSlot: string, recipeId: string) {
    "use server";
    if (!isPlannerDay(day) || !isPlannerMealSlot(mealSlot)) return { error: "Espacio inválido." };
    return assignSlotAction(day, mealSlot, recipeId);
  }
  async function onAddToList(day: string, mealSlot: string) {
    "use server";
    if (!isPlannerDay(day) || !isPlannerMealSlot(mealSlot)) return { error: "Espacio inválido." };
    return addSlotToListAction(day, mealSlot);
  }

  return (
    <main className="flex flex-col gap-6 pb-24">
      <WeeklyPlanner
        assignments={assignments}
        recipes={recipeList.map((r) => ({ id: r.id, title: r.title }))}
        onAssign={onAssign}
        onAddToList={onAddToList}
      />
    </main>
  );
}
