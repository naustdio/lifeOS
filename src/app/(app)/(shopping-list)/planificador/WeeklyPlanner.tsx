"use client";

import { ShoppingCart } from "lucide-react";
import { useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-system/ui/select";

// Locally-declared props (same convention as `ShoppingItemRow.tsx`/`StoreTypeGroupHeader.tsx`) —
// this is a client component and cannot import `@/modules/shopping-list/api` (`server-only`
// barrier), so day/meal-slot literals are duplicated here rather than shared as a type import.
const DAYS: { key: string; label: string }[] = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
];

const MEAL_SLOTS: { key: string; label: string }[] = [
  { key: "desayuno", label: "Desayuno" },
  { key: "comida", label: "Comida" },
  { key: "cena", label: "Cena" },
];

export type WeeklyPlannerAssignment = {
  day: string;
  mealSlot: string;
  recipeId: string;
  recipeTitle: string;
};

/**
 * Producer-only weekly planner (design.md File Changes, tasks.md 6.5, spec
 * `shopping-list-recipe-intake` "Weekly Planner Entry Point Is a Producer Only"). Holds ZERO
 * checkable/clearable item state of its own — each cell either shows an assign-a-recipe `Select`
 * (empty slot) or the assigned recipe's title plus a single "Agregar a mi lista" button (assigned
 * slot), which composes into the SAME continuous shopping list via `onAddToList`. The
 * `assignments` prop is keyed by `(day, mealSlot)`, so at most one recipe renders per cell by
 * construction — never a list of recipes per slot.
 */
export function WeeklyPlanner({
  assignments,
  recipes,
  onAssign,
  onAddToList,
}: {
  assignments: WeeklyPlannerAssignment[];
  recipes: { id: string; title: string }[];
  onAssign: (day: string, mealSlot: string, recipeId: string) => Promise<{ error: string | null }>;
  onAddToList: (day: string, mealSlot: string) => Promise<{ error: string | null }>;
}) {
  const [localAssignments, setLocalAssignments] = useState(assignments);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});

  function slotKey(day: string, mealSlot: string) {
    return `${day}|${mealSlot}`;
  }

  function findAssignment(day: string, mealSlot: string) {
    return localAssignments.find((a) => a.day === day && a.mealSlot === mealSlot);
  }

  async function handleAssign(day: string, mealSlot: string, recipeId: string) {
    const key = slotKey(day, mealSlot);
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe) return;

    setAssigning(key);
    const { error } = await onAssign(day, mealSlot, recipeId);
    setAssigning(null);
    if (error) {
      setErrorByKey((prev) => ({ ...prev, [key]: error }));
      return;
    }
    setLocalAssignments((prev) => [
      ...prev.filter((a) => !(a.day === day && a.mealSlot === mealSlot)),
      { day, mealSlot, recipeId, recipeTitle: recipe.title },
    ]);
  }

  async function handleAddToList(day: string, mealSlot: string) {
    const key = slotKey(day, mealSlot);
    setAddingKey(key);
    setDoneKey(null);
    const { error } = await onAddToList(day, mealSlot);
    setAddingKey(null);
    if (error) setErrorByKey((prev) => ({ ...prev, [key]: error }));
    else setDoneKey(key);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Planificador semanal</h2>

      <div className="flex flex-col gap-4">
        {DAYS.map((day) => (
          <div key={day.key} className="flex flex-col gap-2 rounded-card border border-border/60 bg-card p-4">
            <h3 className="text-sm font-semibold">{day.label}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {MEAL_SLOTS.map((mealSlot) => {
                const key = slotKey(day.key, mealSlot.key);
                const assignment = findAssignment(day.key, mealSlot.key);
                return (
                  <div key={key} className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{mealSlot.label}</span>
                    {assignment ? (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-sm">{assignment.recipeTitle}</span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={addingKey === key}
                          onClick={() => handleAddToList(day.key, mealSlot.key)}
                        >
                          <ShoppingCart className="h-4 w-4" aria-hidden />
                          {addingKey === key ? "Agregando…" : "Agregar a mi lista"}
                        </Button>
                        {doneKey === key && <p className="text-xs text-category-green">Se agregó a tu lista de compras.</p>}
                      </div>
                    ) : (
                      <Select
                        value=""
                        disabled={assigning === key}
                        onValueChange={(recipeId) => handleAssign(day.key, mealSlot.key, recipeId)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sin asignar" />
                        </SelectTrigger>
                        <SelectContent>
                          {recipes.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {errorByKey[key] && <p className="text-xs text-destructive">{errorByKey[key]}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
