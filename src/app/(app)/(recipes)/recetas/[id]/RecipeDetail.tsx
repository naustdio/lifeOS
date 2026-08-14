"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { Input } from "@/design-system/ui/input";
import { VideoEmbed } from "@/design-system/patterns/VideoEmbed";
import { hardDeleteRecipeAction, softDeleteRecipeAction, type RecipeFormState } from "../actions";

const INITIAL_STATE: RecipeFormState = { error: null };

const CATEGORY_LABELS: Record<string, string> = {
  desayuno: "Desayuno",
  comida: "Comida",
  cena: "Cena",
  postre: "Postre",
  snack: "Snack",
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
        <CardHeader>
          <CardTitle>{recipe.title}</CardTitle>
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
                <li key={s.id}>{s.instruction}</li>
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
