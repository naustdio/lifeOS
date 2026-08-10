"use client";

import { useActionState, useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { Input } from "@/design-system/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-system/ui/select";
import { createProfileFactAction, type ProfileFactFormState } from "./actions";

const INITIAL_STATE: ProfileFactFormState = { error: null };

export function ProfileForm() {
  const [state, action, pending] = useActionState(createProfileFactAction, INITIAL_STATE);
  const [factType, setFactType] = useState<"blood_type" | "allergy" | "condition">("condition");

  return (
    <Card id="profile-fact-form">
      <CardHeader>
        <CardTitle>Agregar dato de referencia</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="factType" className="text-sm font-medium">
              Tipo
            </label>
            <Select name="factType" value={factType} onValueChange={(v) => setFactType(v as typeof factType)}>
              <SelectTrigger id="factType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blood_type">Tipo de sangre</SelectItem>
                <SelectItem value="allergy">Alergia</SelectItem>
                <SelectItem value="condition">Condición</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="factLabel" className="text-sm font-medium">
              Etiqueta
            </label>
            <Input id="factLabel" name="label" maxLength={100} required placeholder="Ej. O+, Penicilina, Asma" />
          </div>

          {factType === "allergy" && (
            <div className="flex flex-col gap-1">
              <label htmlFor="factSeverity" className="text-sm font-medium">
                Severidad
              </label>
              <Select name="severity" defaultValue="low">
                <SelectTrigger id="factSeverity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="medium">Media</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="factDetail" className="text-sm font-medium">
              Detalle
            </label>
            <Input id="factDetail" name="detail" maxLength={300} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="factVisibility" className="text-sm font-medium">
              Visibilidad
            </label>
            <Select name="visibility" defaultValue="shared">
              <SelectTrigger id="factVisibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shared">Visible para todos</SelectItem>
                <SelectItem value="private">Privado — solo yo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {state.error && <p className="text-sm text-expense">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Agregar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
