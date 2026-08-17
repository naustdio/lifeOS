"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { Input } from "@/design-system/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/design-system/ui/popover";
import { VideoEmbed } from "@/design-system/patterns/VideoEmbed";
import { hardDeleteRecipeAction, softDeleteRecipeAction, type RecipeFormState } from "../actions";

const INITIAL_STATE: RecipeFormState = { error: null };

const CATEGORY_LABELS: Record<string, string> = {
  desayuno: "Desayuno",
  comida: "Comida",
  cena: "Cena",
  postre: "Postre",
  snack: "Snack",
  complemento: "Complemento",
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
  ingredients: { id: string; position: number; name: string; quantity: number | null; unit: string; subRecipeId: string | null }[];
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
            <button type="button" className="font-medium text-primary underline underline-offset-2">
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

/**
 * Recipe detail — collapsed-by-default "Historial de cambios" (actor/timestamp/reason per row, no
 * field-level diff, spec `recipes-history`), soft-delete behind a mandatory-reason confirmation any
 * member can reach, and an owner-only hard-delete behind a visibly distinct, stronger confirmation
 * (design.md Decision 3). Both deletes route through their Server Actions from `actions.ts`, which
 * re-check role/reason server-side — this UI gating is defence in depth, not the operative gate.
 */
export function RecipeDetail({ recipe, history, isOwner }: { recipe: RecipeDetailRecipe; history: RecipeDetailHistoryEntry[]; isOwner: boolean }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [softOpen, setSoftOpen] = useState(false);
  const [softReason, setSoftReason] = useState("");
  const [softState, softAction, softPending] = useActionState(softDeleteRecipeAction, INITIAL_STATE);

  const [hardOpen, setHardOpen] = useState(false);
  const [hardReason, setHardReason] = useState("");
  const [hardState, hardAction, hardPending] = useActionState(hardDeleteRecipeAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{recipe.title}</CardTitle>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/recetas/${recipe.id}/editar`}>Editar</Link>
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {recipe.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- signed private-bucket URL
            <img src={recipe.photoUrl} alt="" className="aspect-video w-full rounded-card object-cover" />
          )}

          <p className="text-sm text-muted-foreground">
            {CATEGORY_LABELS[recipe.category] ?? recipe.category} · {recipe.portions} porciones
            {recipe.prepMinutes !== null && ` · ${recipe.prepMinutes} min`}
          </p>

          {recipe.videoUrl && <VideoEmbed url={recipe.videoUrl} title={recipe.title} />}

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Ingredientes</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {recipe.ingredients.map((i) => (
                <li key={i.id}>
                  {i.quantity !== null ? `${i.quantity} ${i.unit} ` : ""}
                  {i.subRecipeId ? (
                    <Link href={`/recetas/${i.subRecipeId}`} className="underline underline-offset-2 hover:text-primary">
                      {i.name}
                    </Link>
                  ) : (
                    i.name
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Pasos</h3>
            <ol className="flex flex-col gap-1 text-sm list-decimal pl-4">
              {recipe.steps.map((s) => (
                <li key={s.id}>
                  <StepInstructionText instruction={s.instruction} ingredients={recipe.ingredients} />
                </li>
              ))}
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Button type="button" variant="ghost" className="w-fit" onClick={() => setHistoryOpen((v) => !v)}>
            Historial de cambios
          </Button>
        </CardHeader>
        {historyOpen && (
          <CardContent>
            <ul className="flex flex-col gap-3 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-col gap-0.5 border-b border-border/60 pb-2 last:border-0">
                  <span className="text-xs text-muted-foreground">
                    {ACTION_LABELS[h.action] ?? h.action} · {h.actorUserId} · {h.createdAt}
                  </span>
                  <span>{h.reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          {!softOpen ? (
            <Button type="button" variant="ghost" onClick={() => setSoftOpen(true)}>
              Eliminar
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
              <Button type="submit" disabled={softReason.trim().length < 3 || softPending}>
                Confirmar borrado
              </Button>
              {softState.error && <p className="text-xs text-expense">{softState.error}</p>}
            </form>
          )}

          {isOwner && (
            <>
              {!hardOpen ? (
                <Button type="button" variant="ghost" className="text-expense" onClick={() => setHardOpen(true)}>
                  Eliminar permanentemente
                </Button>
              ) : (
                <form
                  action={(formData) => {
                    formData.set("id", recipe.id);
                    formData.set("reason", hardReason);
                    hardAction(formData);
                  }}
                  className="flex flex-col gap-2 rounded-md border border-expense/60 bg-expense/5 p-3"
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
        </CardContent>
      </Card>
    </div>
  );
}
