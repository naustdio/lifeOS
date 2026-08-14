"use client";

import { Apple, BookOpen, CakeSlice, Moon, Sunrise, Utensils } from "lucide-react";
import { useMemo, useState } from "react";
import { AnimatedFilterTab } from "@/design-system/patterns/AnimatedFilterTab";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { RecipeCard } from "@/design-system/patterns/RecipeCard";
import { Input } from "@/design-system/ui/input";

export type RecipeListEntry = {
  id: string;
  title: string;
  category: string;
  portions: number;
  photoUrl: string | null;
  prepMinutes: number | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  desayuno: "Desayuno",
  comida: "Comida",
  cena: "Cena",
  postre: "Postre",
  snack: "Snack",
};

const CATEGORY_ICONS = {
  desayuno: Sunrise,
  comida: Utensils,
  cena: Moon,
  postre: CakeSlice,
  snack: Apple,
} as const;

/**
 * Client list — name search + category filter chips, composed simultaneously (spec
 * `recipes-catalog` "Searching by partial name returns matches", "Category filter narrows the
 * list", "Search and filter compose on small viewports"). Filtering happens client-side over the
 * already-fetched list for instant feedback; `page.tsx` also reads `q`/`category` from
 * `searchParams` so a shared/reloaded URL reproduces the same view server-side.
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

  const filtered = useMemo(() => {
    return recipes.filter((r) => {
      const matchesQuery = query.trim().length === 0 || r.title.toLowerCase().includes(query.trim().toLowerCase());
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

      {filtered.length === 0 ? (
        <EmptyState icon={BookOpen} heading="No hay recetas" description="Prueba con otra búsqueda o categoría." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((r) => (
            <RecipeCard
              key={r.id}
              href={`/recetas/${r.id}`}
              title={r.title}
              categoryLabel={CATEGORY_LABELS[r.category] ?? r.category}
              photoUrl={r.photoUrl}
              prepMinutes={r.prepMinutes}
            />
          ))}
        </div>
      )}
    </div>
  );
}
