"use client";

import { Plus } from "lucide-react";
import { Reorder } from "motion/react";
import { useActionState, useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { IngredientRow, type IngredientRowUnitOption } from "@/design-system/patterns/IngredientRow";
import { StepRow, type StepDraft } from "@/design-system/patterns/StepRow";
import { Input } from "@/design-system/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-system/ui/select";
import { createRecipeAction, updateRecipeAction, type RecipeFormState } from "./actions";

const INITIAL_STATE: RecipeFormState = { error: null };

const CATEGORIES = [
  { value: "desayuno", label: "Desayuno" },
  { value: "comida", label: "Comida" },
  { value: "cena", label: "Cena" },
  { value: "postre", label: "Postre" },
  { value: "snack", label: "Snack" },
] as const;

type IngredientDraft = { name: string; quantity: string; unit: string };

export type RecipeFormInitial = {
  id: string;
  title: string;
  category: string;
  portions: number;
  videoUrl: string | null;
  ingredients: { name: string; quantity: number | null; unit: string }[];
  steps: { instruction: string }[];
};

/**
 * Create/edit recipe form — spec `recipes-catalog` "Recipe Core Record", "Ingredients are saved
 * in entry order", "Steps render in numeric sequence"; spec `recipes-history` "A UI edit without
 * a reason is blocked". Dynamic ingredient/step rows, unit picklist with a free-text fallback per
 * row (`IngredientRow`), mandatory reason field that blocks submission client-side (server/DB
 * re-validate independently — this is defence in depth, not the operative gate).
 */
export function RecipeForm({ mode, units, initial }: { mode: "create" | "edit"; units: IngredientRowUnitOption[]; initial?: RecipeFormInitial }) {
  const action = mode === "create" ? createRecipeAction : updateRecipeAction;
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[1].value);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(
    initial?.ingredients.map((i) => ({ name: i.name, quantity: i.quantity === null ? "" : String(i.quantity), unit: i.unit })) ?? [],
  );
  const [steps, setSteps] = useState<StepDraft[]>(
    initial?.steps.map((s) => ({ id: crypto.randomUUID(), instruction: s.instruction })) ?? [],
  );
  const [reasonError, setReasonError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length < 3) {
      setReasonError("Escribe un motivo de al menos 3 caracteres.");
      return;
    }
    setReasonError(null);

    formData.set(
      "ingredients",
      JSON.stringify(ingredients.map((ing, position) => ({ position, name: ing.name, quantity: ing.quantity ? Number(ing.quantity) : null, unit: ing.unit }))),
    );
    formData.set("steps", JSON.stringify(steps.map((s, position) => ({ position, instruction: s.instruction }))));
    if (mode === "edit" && initial) {
      formData.set("id", initial.id);
    }

    formAction(formData);
  }

  return (
    <Card id="recipe-form">
      <CardHeader>
        <CardTitle>{mode === "create" ? "Nueva receta" : "Editar receta"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="recipeTitle" className="text-sm font-medium">
              Título
            </label>
            <Input id="recipeTitle" name="title" maxLength={120} defaultValue={initial?.title} required />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="recipeCategory" className="text-sm font-medium">
              Categoría
            </label>
            <Select name="category" value={category} onValueChange={setCategory}>
              <SelectTrigger id="recipeCategory">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="recipePortions" className="text-sm font-medium">
              Porciones
            </label>
            <Input id="recipePortions" name="portions" type="number" min="1" max="99" defaultValue={initial?.portions ?? 4} required />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="recipeVideoUrl" className="text-sm font-medium">
              Video de referencia (opcional)
            </label>
            <Input
              id="recipeVideoUrl"
              name="videoUrl"
              type="url"
              placeholder="https://www.tiktok.com/..."
              defaultValue={initial?.videoUrl ?? ""}
            />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Ingredientes</legend>
            {ingredients.map((ing, i) => (
              <IngredientRow
                key={i}
                index={i}
                name={ing.name}
                quantity={ing.quantity}
                unit={ing.unit}
                units={units}
                onChange={(patch) => setIngredients((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))}
                onRemove={() => setIngredients((prev) => prev.filter((_, idx) => idx !== i))}
              />
            ))}
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-center gap-2"
              onClick={() => setIngredients((prev) => [...prev, { name: "", quantity: "", unit: units[0]?.value ?? "" }])}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Agregar ingrediente
            </Button>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Pasos</legend>
            <Reorder.Group axis="y" values={steps} onReorder={setSteps} className="flex flex-col gap-2">
              {steps.map((s, i) => (
                <StepRow
                  key={s.id}
                  step={s}
                  index={i}
                  onChange={(instruction) => setSteps((prev) => prev.map((p) => (p.id === s.id ? { ...p, instruction } : p)))}
                  onRemove={() => setSteps((prev) => prev.filter((p) => p.id !== s.id))}
                />
              ))}
            </Reorder.Group>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-center gap-2"
              onClick={() => setSteps((prev) => [...prev, { id: crypto.randomUUID(), instruction: "" }])}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Agregar paso
            </Button>
          </fieldset>

          <div className="flex flex-col gap-1">
            <label htmlFor="recipeReason" className="text-sm font-medium">
              Motivo
            </label>
            <Input
              id="recipeReason"
              name="reason"
              maxLength={200}
              placeholder={mode === "create" ? "Ej. primera carga de la receta" : "Ej. corrijo la cantidad de azúcar"}
              required
            />
            {reasonError && <p className="text-xs text-expense">{reasonError}</p>}
          </div>

          {state.error && <p className="text-sm text-expense">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar receta"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
