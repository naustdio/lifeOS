"use client";

import { Lock, UserRound } from "lucide-react";
import { useActionState } from "react";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { deactivateProfileFactAction, type ProfileFactFormState } from "./actions";

type ProfileFact = {
  id: string;
  factType: "blood_type" | "allergy" | "condition";
  label: string;
  detail: string;
  severity: "low" | "medium" | "high" | null;
  visibility: "shared" | "private";
};

const TYPE_LABELS: Record<ProfileFact["factType"], string> = {
  blood_type: "Tipo de sangre",
  allergy: "Alergia",
  condition: "Condición",
};

const INITIAL_STATE: ProfileFactFormState = { error: null };

/** Reference profile — static facts (spec `health-profile` "Profile Facts Are Not Date-Stamped
 *  Events"), not a log. Shows only active facts (design.md/`currentFacts`'s "current state" rule
 *  — filtering already happens server-side via `listProfileFacts`'s default `activeOnly: true`). */
export function ProfileCard({ facts }: { facts: ProfileFact[] }) {
  const [state, action, pending] = useActionState(deactivateProfileFactAction, INITIAL_STATE);

  if (facts.length === 0) {
    return (
      <EmptyState
        icon={UserRound}
        heading="Aún no registraste datos de referencia"
        description="Tipo de sangre, alergias y condiciones crónicas aparecerán aquí."
      />
    );
  }

  return (
    <Card>
      <CardContent className="divide-y divide-border/60 py-2">
        {facts.map((fact) => (
          <div key={fact.id} className="flex items-center justify-between gap-2 py-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {fact.label}
                {fact.visibility === "private" && <Lock className="ml-1 inline h-3 w-3" aria-label="Privado" />}
              </span>
              <span className="text-xs text-muted-foreground">
                {TYPE_LABELS[fact.factType]}
                {fact.severity && ` · ${fact.severity}`}
              </span>
            </div>
            <form
              action={(formData) => {
                formData.set("id", fact.id);
                action(formData);
              }}
            >
              <Button type="submit" variant="ghost" size="sm" disabled={pending}>
                Quitar
              </Button>
            </form>
          </div>
        ))}
        {state.error && <p className="px-4 pb-2 text-xs text-expense">{state.error}</p>}
      </CardContent>
    </Card>
  );
}
