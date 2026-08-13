"use client";

import { BookOpen } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { Card, CardContent } from "@/design-system/ui/card";
import { Input } from "@/design-system/ui/input";

export type RecipeListEntry = { id: string; title: string; category: string; portions: number };

const CATEGORY_LABELS: Record<string, string> = {
  desayuno: "Desayuno",
  comida: "Comida",
  cena: "Cena",
  postre: "Postre",
  snack: "Snack",
};

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

      <div className="flex flex-wrap gap-2">
        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setCategory((prev) => (prev === value ? null : value))}
            className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${
              category === value ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={BookOpen} heading="No hay recetas" description="Prueba con otra búsqueda o categoría." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/60 py-2">
            {filtered.map((r) => (
              <Link key={r.id} href={`/recetas/${r.id}`} className="flex items-center gap-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-secondary text-secondary-foreground">
                  <BookOpen className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 flex flex-col">
                  <span className="truncate text-sm font-medium">{r.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {CATEGORY_LABELS[r.category] ?? r.category} · {r.portions} porciones
                  </span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
