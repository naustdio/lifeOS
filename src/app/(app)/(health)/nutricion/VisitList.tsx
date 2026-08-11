"use client";

import { Apple, Lock } from "lucide-react";
import { useActionState } from "react";
import Link from "next/link";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { formatCentsAsMXN } from "@/shared/money";
import { deleteNutritionVisitAction, type NutritionVisitFormState } from "./actions";

export type NutritionVisitListItem = {
  id: string;
  title: string;
  occurredOn: string;
  providerName: string | null;
  visibility: "shared" | "private";
  amountCents: number | null;
  metricCount: number;
  photoCount: number;
};

const INITIAL_STATE: NutritionVisitFormState = { error: null };

/**
 * List of nutrition visits, newest-first. A legacy visit created before this change (0 metrics,
 * 0 photos) renders as a completable row, not an error state — spec `health-nutrition-visits`
 * "Legacy Pre-Change Nutrition Events Are Visible as Completable Visits".
 */
export function VisitList({ visits }: { visits: NutritionVisitListItem[] }) {
  const [deleteState, deleteAction, deletePending] = useActionState(deleteNutritionVisitAction, INITIAL_STATE);

  if (visits.length === 0) {
    return (
      <EmptyState
        icon={Apple}
        heading="Aún no registraste visitas de nutrición"
        description="Cada consulta con su nutriólogo, con sus métricas y fotos de avance, aparecerá aquí."
      />
    );
  }

  return (
    <Card>
      <CardContent className="divide-y divide-border/60 py-2">
        {visits.map((visit) => (
          <div key={visit.id} className="flex flex-col gap-2 py-3">
            <Link href={`/nutricion/${visit.id}`} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-secondary text-secondary-foreground">
                <Apple className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 flex flex-col">
                <span className="truncate text-sm font-medium">
                  {visit.title}
                  {visit.visibility === "private" && <Lock className="ml-1 inline h-3 w-3" aria-label="Privado" />}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {visit.occurredOn}
                  {visit.providerName ? ` · ${visit.providerName}` : ""} ·{" "}
                  {visit.metricCount === 0 ? "Sin métricas todavía" : `${visit.metricCount} métricas`} · {visit.photoCount} fotos
                </span>
              </div>
              {visit.amountCents !== null && (
                <span className="text-sm font-medium">{formatCentsAsMXN(-visit.amountCents)}</span>
              )}
            </Link>
            <div className="flex items-center gap-2 pl-12">
              <form
                action={(formData) => {
                  formData.set("id", visit.id);
                  deleteAction(formData);
                }}
                onSubmit={(e) => {
                  if (!window.confirm("¿Eliminar esta visita de nutrición?")) {
                    e.preventDefault();
                  }
                }}
              >
                <Button type="submit" variant="ghost" size="sm" disabled={deletePending}>
                  Eliminar
                </Button>
              </form>
            </div>
          </div>
        ))}
        {deleteState.error && <p className="px-4 pb-2 text-xs text-expense">{deleteState.error}</p>}
      </CardContent>
    </Card>
  );
}
