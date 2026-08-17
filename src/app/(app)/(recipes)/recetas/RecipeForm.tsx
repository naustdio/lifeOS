"use client";

import { Camera, Plus, X } from "lucide-react";
import { Reorder } from "motion/react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import {
  IngredientRow,
  type IngredientCatalogOption,
  type IngredientRowRecipeOption,
  type IngredientRowUnitOption,
} from "@/design-system/patterns/IngredientRow";
import { StepRow, type StepDraft } from "@/design-system/patterns/StepRow";
import { Input } from "@/design-system/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-system/ui/select";
import { Textarea } from "@/design-system/ui/textarea";
import {
  attachIngredientPhotoAction,
  createRecipeAction,
  setIngredientIconAction,
  updateRecipeAction,
  uploadRecipePhotoAction,
  type RecipeFormState,
} from "./actions";

const INITIAL_STATE: RecipeFormState = { error: null };

const CATEGORIES = [
  { value: "desayuno", label: "Desayuno" },
  { value: "comida", label: "Comida" },
  { value: "cena", label: "Cena" },
  { value: "postre", label: "Postre" },
  { value: "snack", label: "Snack" },
  { value: "complemento", label: "Complemento" },
] as const;

type IngredientDraft = { name: string; quantity: string; unit: string; subRecipeId: string | null; estimatedUnitCost: string };

export type RecipeFormInitial = {
  id: string;
  title: string;
  category: string;
  portions: number;
  videoUrl: string | null;
  prepMinutes: number | null;
  photoUrl: string | null;
  description: string | null;
  ingredients: { name: string; quantity: number | null; unit: string; subRecipeId: string | null; estimatedUnitCost: number | null }[];
  steps: { instruction: string }[];
};

/**
 * Create/edit recipe form — spec `recipes-catalog` "Recipe Core Record", "Ingredients are saved
 * in entry order", "Steps render in numeric sequence"; spec `recipes-history` "A UI edit without
 * a reason is blocked" — that requirement is EDIT-only (and soft/hard-delete, handled separately
 * in `RecipeDetail`), so the "Motivo" field only renders in edit mode; creating a recipe has no
 * prior state to explain and writes a fixed reason server-side instead. Dynamic ingredient/step
 * rows, unit picklist with a free-text fallback per row (`IngredientRow`), mandatory reason field
 * that blocks submission client-side in edit mode (server/DB re-validate independently — this is
 * defence in depth, not the operative gate).
 */
export function RecipeForm({
  mode,
  units,
  catalog,
  recipeOptions,
  initial,
  onCreated,
  onClose,
}: {
  mode: "create" | "edit";
  units: IngredientRowUnitOption[];
  catalog: IngredientCatalogOption[];
  recipeOptions: IngredientRowRecipeOption[];
  initial?: RecipeFormInitial;
  /** Fired once a create succeeds (after the create-success reset below) — lets a modal-hosted
   *  create form (`NewRecipeLauncher`) close itself instead of sitting open on a blank form. */
  onCreated?: () => void;
  /** Renders a close (X) button in the header — only meaningful when this form is hosted inside
   *  a dismissible container (the create modal); the standalone edit route has no `onClose`. */
  onClose?: () => void;
}) {
  const action = mode === "create" ? createRecipeAction : updateRecipeAction;
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[1].value);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(
    initial?.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity === null ? "" : String(i.quantity),
      unit: i.unit,
      subRecipeId: i.subRecipeId,
      estimatedUnitCost: i.estimatedUnitCost === null ? "" : String(i.estimatedUnitCost),
    })) ?? [],
  );
  // Accordion behaviour: only one ingredient row expanded at a time, so a long ingredient list
  // doesn't turn into an endless scroll (owned here, not per-row, since expanding one must collapse
  // whichever other row was open).
  const [expandedIngredientIndex, setExpandedIngredientIndex] = useState<number | null>(null);
  // Feeds the "@" mention autocomplete in step instructions (StepRow) — recomputed as ingredient
  // rows change so a name typed moments ago is immediately citable.
  const ingredientNames = useMemo(() => ingredients.map((i) => i.name.trim()).filter(Boolean), [ingredients]);
  const [steps, setSteps] = useState<StepDraft[]>(
    initial?.steps.map((s) => ({ id: crypto.randomUUID(), instruction: s.instruction })) ?? [],
  );
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(initial?.photoUrl ?? null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Tracked separately from the server-fetched `catalog` prop so a photo/icon attached to a
  // brand-new ingredient name becomes available to THIS form's own autocomplete immediately —
  // the server prop only refreshes on next navigation, but a household member filling in several
  // ingredients in one sitting expects row 2's suggestions to already include what they just set
  // up for row 1.
  const [catalogState, setCatalogState] = useState<IngredientCatalogOption[]>(catalog);

  function upsertCatalogState(name: string, patch: Partial<IngredientCatalogOption>) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCatalogState((prev) => {
      const idx = prev.findIndex((c) => c.name.toLowerCase() === trimmed.toLowerCase());
      if (idx === -1) {
        return [...prev, { name: trimmed, photoUrl: null, icon: null, ...patch }];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  // The recipe doesn't exist (no id to point a photo at) until `createRecipeAction` returns — a
  // photo picked in create mode is staged locally and only actually uploaded once `state.id`
  // shows up here. In edit mode the recipe already exists, so `handlePhotoSelected` uploads
  // immediately instead of staging.
  //
  // `useActionState` only resets uncontrolled/native fields on a successful submission — every
  // piece of React state this form owns (photo preview, ingredients, steps, category) survives a
  // create and would otherwise leak into the next "Nueva receta" entry, so a fresh `state.id`
  // also means: upload the staged photo (if any), then reset the create form back to blank.
  useEffect(() => {
    if (mode !== "create" || !state?.id) return;
    const newId = state.id;

    if (pendingPhotoFile) {
      const file = pendingPhotoFile;
      setPendingPhotoFile(null);
      void uploadRecipePhotoAction(newId, file);
    }

    formRef.current?.reset();
    setPhotoPreviewUrl(null);
    setCategory(CATEGORIES[1].value);
    setIngredients([]);
    setSteps([]);
    onCreated?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to a fresh id appearing
  }, [state?.id]);

  async function handlePhotoSelected(file: File | undefined) {
    if (!file) return;
    setPhotoPreviewUrl(URL.createObjectURL(file));
    if (mode === "edit" && initial) {
      await uploadRecipePhotoAction(initial.id, file);
    } else {
      setPendingPhotoFile(file);
    }
  }

  function handleSubmit(formData: FormData) {
    if (mode === "edit") {
      const reason = String(formData.get("reason") ?? "").trim();
      if (reason.length < 3) {
        setReasonError("Escribe un motivo de al menos 3 caracteres.");
        return;
      }
      setReasonError(null);
    }

    formData.set(
      "ingredients",
      JSON.stringify(
        ingredients.map((ing, position) => ({
          position,
          name: ing.name,
          quantity: ing.quantity ? Number(ing.quantity) : null,
          unit: ing.unit,
          subRecipeId: ing.subRecipeId,
          estimatedUnitCost: ing.estimatedUnitCost ? Number(ing.estimatedUnitCost) : null,
        })),
      ),
    );
    formData.set("steps", JSON.stringify(steps.map((s, position) => ({ position, instruction: s.instruction }))));
    if (mode === "edit" && initial) {
      formData.set("id", initial.id);
    }

    formAction(formData);
  }

  return (
    <Card id="recipe-form">
      <CardHeader className={onClose ? "flex flex-row items-center justify-between gap-2" : undefined}>
        <CardTitle>{mode === "create" ? "Nueva receta" : "Editar receta"}</CardTitle>
        {onClose && (
          <Button type="button" variant="secondary" size="icon" className="h-9 w-9 shrink-0 rounded-full" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Foto (opcional)</span>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handlePhotoSelected(e.target.files?.[0])}
              aria-label="Foto de la receta"
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-card border-2 border-dashed border-border bg-secondary/50 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/50"
            >
              {photoPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local/signed object URL preview
                <img src={photoPreviewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1 text-xs">
                  <Camera className="h-5 w-5" aria-hidden />
                  Agregar foto
                </span>
              )}
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="recipeTitle" className="text-sm font-medium">
              Título
            </label>
            <Input id="recipeTitle" name="title" maxLength={120} defaultValue={initial?.title} required />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="recipeDescription" className="text-sm font-medium">
              Descripción (opcional)
            </label>
            <Textarea
              id="recipeDescription"
              name="description"
              maxLength={500}
              placeholder="Ej. Una ensalada fresca y ligera, ideal para el verano."
              defaultValue={initial?.description ?? ""}
            />
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
            <label htmlFor="recipePrepMinutes" className="text-sm font-medium">
              Duración de preparación en minutos (opcional)
            </label>
            <Input
              id="recipePrepMinutes"
              name="prepMinutes"
              type="number"
              min="1"
              max="1440"
              placeholder="Ej. 25"
              defaultValue={initial?.prepMinutes ?? ""}
            />
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
                subRecipeId={ing.subRecipeId}
                estimatedUnitCost={ing.estimatedUnitCost}
                units={units}
                catalog={catalogState}
                recipeOptions={recipeOptions}
                expanded={expandedIngredientIndex === i}
                onExpandedChange={(next) => setExpandedIngredientIndex(next ? i : null)}
                onChange={(patch) => setIngredients((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))}
                onRemove={() => {
                  setIngredients((prev) => prev.filter((_, idx) => idx !== i));
                  setExpandedIngredientIndex((prev) => (prev === null ? null : prev === i ? null : prev > i ? prev - 1 : prev));
                }}
                onAttachPhoto={async (file) => {
                  const result = await attachIngredientPhotoAction(ing.name, file);
                  if (!result.error) upsertCatalogState(ing.name, { photoUrl: URL.createObjectURL(file), icon: null });
                  return result;
                }}
                onSetIcon={async (icon) => {
                  const result = await setIngredientIconAction(ing.name, icon);
                  if (!result.error) upsertCatalogState(ing.name, { icon, photoUrl: null });
                  return result;
                }}
              />
            ))}
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-center gap-2"
              onClick={() => {
                setIngredients((prev) => [
                  ...prev,
                  { name: "", quantity: "", unit: units[0]?.value ?? "", subRecipeId: null, estimatedUnitCost: "" },
                ]);
                setExpandedIngredientIndex(ingredients.length);
              }}
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
                  ingredientNames={ingredientNames}
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

          {mode === "edit" && (
            <div className="flex flex-col gap-1">
              <label htmlFor="recipeReason" className="text-sm font-medium">
                Motivo
              </label>
              <Input
                id="recipeReason"
                name="reason"
                maxLength={200}
                placeholder="Ej. corrijo la cantidad de azúcar"
                required
              />
              {reasonError && <p className="text-xs text-expense">{reasonError}</p>}
            </div>
          )}

          {state.error && <p className="text-sm text-expense">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar receta"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
