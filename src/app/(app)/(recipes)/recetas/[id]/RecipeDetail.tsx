"use client";

import Link from "next/link";
import { ArrowLeft, Bookmark, BookOpen, ChevronDown, Clock, Minus, Pencil, Plus, Users } from "lucide-react";
import { useActionState, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/design-system/ui/button";
import { Input } from "@/design-system/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/design-system/ui/popover";
import { cn } from "@/design-system/ui/utils";
import { VideoEmbed } from "@/design-system/patterns/VideoEmbed";
import { hardDeleteRecipeAction, softDeleteRecipeAction, toggleFavoriteAction, type RecipeFormState } from "../actions";

const INITIAL_STATE: RecipeFormState = { error: null };

const CATEGORY_LABELS: Record<string, string> = {
  desayuno: "Desayuno",
  comida: "Comida",
  cena: "Cena",
  postre: "Postre",
  snack: "Snack",
  complemento: "Complemento",
};

// Reuses the app-wide category color scale (design-system tokens/semantic.css) rather than
// inventing new hex values — each recipe category gets a fixed hue, distinct from (and unrelated
// to) the finance module's own user-assignable category colors.
const CATEGORY_COLOR_CLASSES: Record<string, { text: string; surface: string }> = {
  desayuno: { text: "text-category-amber", surface: "bg-category-amber-surface" },
  comida: { text: "text-category-green", surface: "bg-category-green-surface" },
  cena: { text: "text-category-violet", surface: "bg-category-violet-surface" },
  postre: { text: "text-category-pink", surface: "bg-category-pink-surface" },
  snack: { text: "text-category-orange", surface: "bg-category-orange-surface" },
  complemento: { text: "text-category-teal", surface: "bg-category-teal-surface" },
};

const ACTION_LABELS: Record<string, string> = {
  created: "Creada",
  edited: "Editada",
  soft_deleted: "Eliminada",
  restored: "Restaurada",
  hard_deleted: "Eliminada permanentemente",
};

export type RecipeDetailRecipe = {
  id: string;
  title: string;
  category: string;
  portions: number;
  videoUrl: string | null;
  prepMinutes: number | null;
  photoUrl: string | null;
  description: string | null;
  ingredients: {
    id: string;
    position: number;
    name: string;
    quantity: number | null;
    unit: string;
    subRecipeId: string | null;
    estimatedUnitCost: number | null;
  }[];
  steps: { id: string; position: number; instruction: string }[];
};

export type RecipeDetailHistoryEntry = {
  id: string;
  recipeId: string | null;
  recipeTitle: string;
  actorUserId: string;
  action: "created" | "edited" | "soft_deleted" | "restored" | "hard_deleted";
  reason: string;
  createdAt: string;
};

/** Formats a scaled ingredient quantity — up to 2 decimals, no trailing zeros (e.g. 1.5, not
 *  1.50; 2, not 2.00). Scaling is display-only, never persisted. */
function formatScaledQuantity(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Renders a step's instruction text, turning any "@IngredientName" substring that matches this
 * recipe's own ingredients into a clickable chip that opens a popover with its quantity/unit (UI-
 * polish fast-follow: plain-text @mentions, settled via grill-me interview — no structured tag, so
 * a later ingredient rename just stops matching instead of breaking the step text). Longest names
 * match first so e.g. "@Queso panela" doesn't get cut short by a shorter "@Queso" also on the list.
 */
function StepInstructionText({ instruction, ingredients }: { instruction: string; ingredients: RecipeDetailRecipe["ingredients"] }) {
  const mentionPattern = useMemo(() => {
    const names = ingredients.map((i) => i.name.trim()).filter(Boolean);
    if (names.length === 0) return null;
    const sorted = [...new Set(names)].sort((a, b) => b.length - a.length);
    return new RegExp(`@(${sorted.map(escapeRegExp).join("|")})`, "gi");
  }, [ingredients]);

  if (!mentionPattern) return <>{instruction}</>;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  mentionPattern.lastIndex = 0;
  while ((match = mentionPattern.exec(instruction))) {
    if (match.index > lastIndex) parts.push(instruction.slice(lastIndex, match.index));
    const matchedName = match[1];
    const ingredient = ingredients.find((i) => i.name.toLowerCase() === matchedName.toLowerCase());
    if (ingredient) {
      parts.push(
        <Popover key={key++}>
          <PopoverTrigger asChild>
            <button type="button" className="font-medium text-category-green underline underline-offset-2">
              @{matchedName}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto text-sm">
            <p className="font-medium">{ingredient.name}</p>
            {(ingredient.quantity !== null || ingredient.unit) && (
              <p className="text-muted-foreground">
                {ingredient.quantity !== null ? `${ingredient.quantity} ` : ""}
                {ingredient.unit}
              </p>
            )}
          </PopoverContent>
        </Popover>,
      );
    } else {
      parts.push(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < instruction.length) parts.push(instruction.slice(lastIndex));

  return <>{parts}</>;
}

/** One collapsible row in the "Pasos" accordion — see `RecipeDetail`'s `expandedStepIndex` for why
 *  only one step opens at a time (same pattern as `RecipeForm`'s ingredient-row accordion). */
function StepAccordionRow({
  index,
  instruction,
  ingredients,
  open,
  onToggle,
}: {
  index: number;
  instruction: string;
  ingredients: RecipeDetailRecipe["ingredients"];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-card bg-secondary">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-secondary-foreground"
      >
        Paso {index + 1}
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <p className="px-4 pb-4 text-sm text-secondary-foreground">
          <StepInstructionText instruction={instruction} ingredients={ingredients} />
        </p>
      )}
    </div>
  );
}

/**
 * Recipe detail — full-bleed hero photo with floating back/edit buttons and an overlapping
 * rounded info panel (UI-polish fast-follow, adapted from a Penpot reference design: same visual
 * language — photo-forward hero, colored category pill, pill-shaped "Pasos" accordion, a single
 * prominent delete CTA — reusing this app's own design tokens throughout instead of the
 * reference's literal colors, so light/dark theming stays intact). Also carries a description,
 * a per-user favorite toggle, and an estimated total cost — calorie/carb/protein macros are the
 * one thing from that reference still not built (no way to measure them decided yet).
 *
 * Collapsed-by-default "Historial de cambios" (actor/timestamp/reason per row, no field-level
 * diff, spec `recipes-history`), soft-delete behind a mandatory-reason confirmation any member can
 * reach, and an owner-only hard-delete behind a visibly distinct, stronger confirmation (design.md
 * Decision 3). Both deletes route through their Server Actions from `actions.ts`, which re-check
 * role/reason server-side — this UI gating is defence in depth, not the operative gate.
 */
export function RecipeDetail({
  recipe,
  history,
  isOwner,
  isFavorited,
}: {
  recipe: RecipeDetailRecipe;
  history: RecipeDetailHistoryEntry[];
  isOwner: boolean;
  isFavorited: boolean;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);
  // Portion scaling (UI-polish fast-follow): display-only — scales the shown ingredient
  // quantities by targetPortions/recipe.portions, never rewrites the saved recipe.
  const [targetPortions, setTargetPortions] = useState(recipe.portions);
  const scaleRatio = recipe.portions > 0 ? targetPortions / recipe.portions : 1;
  // Favorite toggle (UI-polish fast-follow, per-user): optimistic local flip, reconciled with the
  // server via `toggleFavoriteAction`; reverts on error rather than trusting the optimistic state.
  const [favorited, setFavorited] = useState(isFavorited);
  const [favoritePending, setFavoritePending] = useState(false);
  async function handleToggleFavorite() {
    const next = !favorited;
    setFavorited(next);
    setFavoritePending(true);
    const result = await toggleFavoriteAction(recipe.id, favorited);
    setFavoritePending(false);
    if (result.error) setFavorited(!next);
  }
  const estimatedTotalCost = recipe.ingredients.reduce((sum, i) => {
    if (i.quantity === null || i.estimatedUnitCost === null) return sum;
    return sum + i.quantity * scaleRatio * i.estimatedUnitCost;
  }, 0);
  const [softOpen, setSoftOpen] = useState(false);
  const [softReason, setSoftReason] = useState("");
  const [softState, softAction, softPending] = useActionState(softDeleteRecipeAction, INITIAL_STATE);

  const [hardOpen, setHardOpen] = useState(false);
  const [hardReason, setHardReason] = useState("");
  const [hardState, hardAction, hardPending] = useActionState(hardDeleteRecipeAction, INITIAL_STATE);

  const categoryColor = CATEGORY_COLOR_CLASSES[recipe.category] ?? CATEGORY_COLOR_CLASSES.comida;
  const floatingIconButtonClass = "flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60";

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-card bg-card shadow-soft">
        <div className="relative aspect-[4/3] w-full bg-secondary">
          {recipe.photoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed private-bucket URL */}
              <img src={recipe.photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
                style={{ background: "linear-gradient(to top, rgb(0 0 0 / 0.55), transparent)" }}
              />
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <BookOpen className="h-12 w-12 text-muted-foreground" aria-hidden />
            </div>
          )}

          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <Link
              href="/recetas"
              className={cn(floatingIconButtonClass, !recipe.photoUrl && "bg-card/70 text-foreground hover:bg-card")}
              aria-label="Volver a recetas"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Link>
            <Link
              href={`/recetas/${recipe.id}/editar`}
              className={cn(floatingIconButtonClass, !recipe.photoUrl && "bg-card/70 text-foreground hover:bg-card")}
              aria-label="Editar receta"
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <button
            type="button"
            onClick={handleToggleFavorite}
            disabled={favoritePending}
            aria-pressed={favorited}
            aria-label={favorited ? "Quitar de favoritos" : "Agregar a favoritos"}
            className={cn(floatingIconButtonClass, "absolute right-4 bottom-4", !recipe.photoUrl && "bg-card/70 text-foreground hover:bg-card")}
          >
            <Bookmark className={cn("h-4 w-4", favorited && "fill-current")} aria-hidden />
          </button>
        </div>

        <div className="relative -mt-6 rounded-t-[1.75rem] bg-card px-5 pt-6 pb-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold">
              {recipe.prepMinutes !== null && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {recipe.prepMinutes} min
                </span>
              )}
              <span className="flex items-center gap-1.5 rounded-pill bg-secondary pl-2.5">
                <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
                <button
                  type="button"
                  onClick={() => setTargetPortions((p) => Math.max(1, p - 1))}
                  disabled={targetPortions <= 1}
                  aria-label="Menos porciones"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent disabled:opacity-40"
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden />
                </button>
                <span className="min-w-[4.5rem] text-center">
                  {targetPortions} porcion{targetPortions === 1 ? "" : "es"}
                </span>
                <button
                  type="button"
                  onClick={() => setTargetPortions((p) => p + 1)}
                  aria-label="Más porciones"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            </div>
            <span className={cn("shrink-0 rounded-pill px-3 py-1 text-xs font-semibold", categoryColor.surface, categoryColor.text)}>
              {CATEGORY_LABELS[recipe.category] ?? recipe.category}
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-card-foreground">{recipe.title}</h1>

          {recipe.description && <p className="mt-2 text-sm text-muted-foreground">{recipe.description}</p>}

          {recipe.videoUrl && (
            <div className="mt-4">
              <VideoEmbed url={recipe.videoUrl} title={recipe.title} />
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Ingredientes</h2>
              {estimatedTotalCost > 0 && (
                <span className="text-xs font-semibold text-muted-foreground">Costo estimado: ${estimatedTotalCost.toFixed(2)}</span>
              )}
            </div>
            <ul className="flex flex-col gap-1.5 text-sm text-card-foreground">
              {recipe.ingredients.map((i) => (
                <li key={i.id} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-card-foreground" aria-hidden />
                  <span>
                    {i.quantity !== null ? `${formatScaledQuantity(i.quantity * scaleRatio)} ${i.unit} ` : ""}
                    {i.subRecipeId ? (
                      <Link href={`/recetas/${i.subRecipeId}`} className="underline underline-offset-2 hover:text-category-green">
                        {i.name}
                      </Link>
                    ) : (
                      i.name
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">Pasos</h2>
        {recipe.steps.map((s, i) => (
          <StepAccordionRow
            key={s.id}
            index={i}
            instruction={s.instruction}
            ingredients={recipe.ingredients}
            open={expandedStepIndex === i}
            onToggle={() => setExpandedStepIndex((prev) => (prev === i ? null : i))}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-card bg-secondary">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          aria-expanded={historyOpen}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-secondary-foreground"
        >
          Historial de cambios
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", historyOpen && "rotate-180")} aria-hidden />
        </button>
        {historyOpen && (
          <ul className="flex flex-col gap-3 px-4 pb-4 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-col gap-0.5 border-b border-border/60 pb-2 last:border-0">
                <span className="text-xs text-muted-foreground">
                  {ACTION_LABELS[h.action] ?? h.action} · {h.actorUserId} · {h.createdAt}
                </span>
                <span>{h.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {!softOpen ? (
          <Button type="button" variant="destructive" size="lg" className="w-full" onClick={() => setSoftOpen(true)}>
            Eliminar receta
          </Button>
        ) : (
          <form
            action={(formData) => {
              formData.set("id", recipe.id);
              formData.set("reason", softReason);
              softAction(formData);
            }}
            className="flex flex-col gap-2"
          >
            <label htmlFor="softDeleteReason" className="text-sm font-medium">
              Motivo del borrado
            </label>
            <Input id="softDeleteReason" value={softReason} onChange={(e) => setSoftReason(e.target.value)} placeholder="Ej. ya no la usamos" />
            <Button type="submit" variant="destructive" size="lg" className="w-full" disabled={softReason.trim().length < 3 || softPending}>
              Confirmar borrado
            </Button>
            {softState.error && <p className="text-xs text-expense">{softState.error}</p>}
          </form>
        )}

        {isOwner && (
          <>
            {!hardOpen ? (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="w-full border-2 border-expense text-expense hover:bg-expense/10"
                onClick={() => setHardOpen(true)}
              >
                Eliminar permanentemente
              </Button>
            ) : (
              <form
                action={(formData) => {
                  formData.set("id", recipe.id);
                  formData.set("reason", hardReason);
                  hardAction(formData);
                }}
                className="flex flex-col gap-2 rounded-card border border-expense/60 bg-expense/5 p-3"
              >
                <p className="text-sm font-medium text-expense">
                  Esta acción no se puede deshacer. La receta y sus ingredientes/pasos se eliminarán para siempre.
                </p>
                <label htmlFor="hardDeleteReason" className="text-sm font-medium">
                  Motivo del borrado permanente
                </label>
                <Input
                  id="hardDeleteReason"
                  value={hardReason}
                  onChange={(e) => setHardReason(e.target.value)}
                  placeholder="Ej. receta duplicada por error"
                />
                <Button type="submit" variant="destructive" disabled={hardReason.trim().length < 3 || hardPending}>
                  Sí, eliminar permanentemente
                </Button>
                {hardState.error && <p className="text-xs text-expense">{hardState.error}</p>}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
