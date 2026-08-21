"use client";

import { Apple, BookOpen, CakeSlice, CheckSquare, Moon, Salad, ShoppingCart, Square, Sunrise, Utensils, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AnimatedFilterTab } from "@/design-system/patterns/AnimatedFilterTab";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { RecipeCard } from "@/design-system/patterns/RecipeCard";
import { Button } from "@/design-system/ui/button";
import { Input } from "@/design-system/ui/input";
import { generateFromRecipesAction } from "../../(shopping-list)/lista-de-compras/actions";

export type RecipeListEntry = {
  id: string;
  title: string;
  category: string;
  portions: number;
  photoUrl: string | null;
  prepMinutes: number | null;
  ingredientNames: string[];
};

const CATEGORY_LABELS: Record<string, string> = {
  desayuno: "Desayuno",
  comida: "Comida",
  cena: "Cena",
  postre: "Postre",
  snack: "Snack",
  complemento: "Complemento",
};

const CATEGORY_ICONS = {
  desayuno: Sunrise,
  comida: Utensils,
  cena: Moon,
  postre: CakeSlice,
  snack: Apple,
  complemento: Salad,
} as const;

/**
 * Client list — name search + category filter chips, composed simultaneously (spec
 * `recipes-catalog` "Searching by partial name returns matches", "Category filter narrows the
 * list", "Search and filter compose on small viewports"). Filtering happens client-side over the
 * already-fetched list for instant feedback; `page.tsx` also reads `q`/`category` from
 * `searchParams` so a shared/reloaded URL reproduces the same view server-side. The query also
 * matches any of a recipe's `ingredientNames` (UI-polish fast-follow "search by ingredient"),
 * pre-fetched by `page.tsx` so this stays a zero-round-trip client filter.
 */
export function RecipeList({
  recipes,
  initialQuery,
  initialCategory,
}: {
  recipes: RecipeListEntry[];
  initialQuery: string;
  initialCategory: string | null;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(initialCategory);
  // Multi-select mode (Phase 5, spec `shopping-list-recipe-intake` "Multi-Select Entry Point From
  // Recipe List") — a bulk "Generar lista de compras" over the selected recipes, each scaled
  // independently at its own `portions` (no per-recipe portion override in this entry point).
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Shared target portions for the whole selection — each recipe still scales "independently"
  // (spec `shopping-list-recipe-intake` "Multi-Select Entry Point From Recipe List") in the sense
  // that `generateFromRecipesAction` computes its own ratio per recipe from ITS `portions`, using
  // this one shared target as the numerator for every recipe in the call.
  const [bulkTargetPortions, setBulkTargetPortions] = useState(4);
  const [generatePending, setGeneratePending] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateDone, setGenerateDone] = useState(false);

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
    setGenerateError(null);
    setGenerateDone(false);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Bulk "Generar lista de compras" — one `generateFromRecipesAction` call carrying every
   *  selected recipe id (spec: "ingredient items from both recipes are added ... in a single
   *  operation"), not one call per recipe. */
  async function handleGenerateFromSelection() {
    if (selectedIds.size === 0) return;
    setGeneratePending(true);
    setGenerateError(null);
    setGenerateDone(false);
    const result = await generateFromRecipesAction({ recipeIds: [...selectedIds], targetPortions: bulkTargetPortions });
    setGeneratePending(false);
    if (result.error) {
      setGenerateError(result.error);
      return;
    }
    setGenerateDone(true);
    setSelectedIds(new Set());
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      const matchesQuery = q.length === 0 || r.title.toLowerCase().includes(q) || r.ingredientNames.some((name) => name.toLowerCase().includes(q));
      const matchesCategory = category === null || r.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [recipes, query, category]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="recipeSearch" className="text-sm font-medium">
          Buscar receta
        </label>
        <Input id="recipeSearch" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre de la receta" />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Filtro por categoría">
        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
          <AnimatedFilterTab
            key={value}
            label={label}
            icon={CATEGORY_ICONS[value as keyof typeof CATEGORY_ICONS]}
            isActive={category === value}
            onSelect={() => setCategory((prev) => (prev === value ? null : value))}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={toggleSelectMode}>
          {selectMode ? (
            <>
              <X className="h-4 w-4" aria-hidden />
              Cancelar selección
            </>
          ) : (
            <>
              <CheckSquare className="h-4 w-4" aria-hidden />
              Seleccionar recetas
            </>
          )}
        </Button>
        {selectMode && <span className="text-xs text-muted-foreground">{selectedIds.size} seleccionada{selectedIds.size === 1 ? "" : "s"}</span>}
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card bg-secondary px-4 py-3">
          <label htmlFor="bulkTargetPortions" className="text-xs font-semibold text-secondary-foreground">
            Porciones objetivo
          </label>
          <Input
            id="bulkTargetPortions"
            type="number"
            min={1}
            value={bulkTargetPortions}
            onChange={(e) => setBulkTargetPortions(Math.max(1, Number(e.target.value) || 1))}
            className="w-20"
          />
          <Button type="button" size="sm" onClick={handleGenerateFromSelection} disabled={generatePending}>
            <ShoppingCart className="h-4 w-4" aria-hidden />
            {generatePending ? "Generando…" : "Generar lista de compras"}
          </Button>
        </div>
      )}
      {generateDone && <p className="text-xs text-category-green">Se agregó a tu lista de compras.</p>}
      {generateError && <p className="text-xs text-expense">{generateError}</p>}

      {filtered.length === 0 ? (
        <EmptyState icon={BookOpen} heading="No hay recetas" description="Prueba con otra búsqueda o categoría." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="relative"
              onClickCapture={(e) => {
                if (!selectMode) return;
                e.preventDefault();
                e.stopPropagation();
                toggleSelected(r.id);
              }}
            >
              <RecipeCard
                href={`/recetas/${r.id}`}
                title={r.title}
                categoryLabel={CATEGORY_LABELS[r.category] ?? r.category}
                photoUrl={r.photoUrl}
                prepMinutes={r.prepMinutes}
              />
              {selectMode && (
                <span className="absolute top-3 left-3 flex h-6 w-6 items-center justify-center rounded-full bg-card shadow-soft">
                  {selectedIds.has(r.id) ? (
                    <CheckSquare className="h-4 w-4 text-category-green" aria-hidden />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground" aria-hidden />
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
