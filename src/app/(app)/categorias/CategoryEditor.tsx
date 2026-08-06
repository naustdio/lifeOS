"use client";

import { useActionState, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { Input } from "@/design-system/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-system/ui/select";
import { validateCategoryShape, type CategoryKind } from "@/modules/finance/api/category-validation";
import { ColorPicker } from "./ColorPicker";
import { IconPicker } from "./IconPicker";
import { createCategoryAction, updateCategoryAction, type CategoryFormState } from "./actions";

const NO_PARENT = "__none__";

type ParentOption = { id: string; name: string; kind: CategoryKind; parentId: string | null };

type InitialCategory = {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  icon: string | null;
  color: string | null;
};

const INITIAL_STATE: CategoryFormState = { error: null };

/**
 * Create/edit Sheet (design.md §5, change: finance-categories-icon-color C-016). Kind and
 * parent are only editable on create — `updateCategory` structurally excludes them (§6
 * Decision 7), so the edit form omits both selects entirely rather than submitting fields the
 * repository would ignore. `validateCategoryShape` runs client-side on every change as a
 * preview of the DB trigger, disabling submit for an illegal shape before the round trip.
 */
export function CategoryEditor({
  mode,
  initial,
  parentOptions,
  onClose,
}: {
  mode: "create" | "edit";
  initial: InitialCategory | null;
  parentOptions: ParentOption[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    mode === "edit" ? updateCategoryAction : createCategoryAction,
    INITIAL_STATE,
  );
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [kind, setKind] = useState<CategoryKind>(initial?.kind ?? "expense");
  const [parentId, setParentId] = useState<string | null>(initial?.parentId ?? null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (submitted && !pending && !state.error) {
      onClose();
    }
  }, [submitted, pending, state.error, onClose]);

  // Parent MUST be top-level only (design.md §5) — filtering here means a depth-2 item can
  // never be reached as a selectable option even if the caller passes one in defensively.
  const topLevelParents = parentOptions.filter((p) => p.parentId === null);
  const parent = topLevelParents.find((p) => p.id === parentId) ?? null;
  const shapeError = validateCategoryShape(
    { kind, parentId },
    parent ? { id: parent.id, kind: parent.kind, parentId: parent.parentId } : null,
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (shapeError) {
      event.preventDefault();
      return;
    }
    setSubmitted(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <Card className="w-full max-w-sm" onClick={(event) => event.stopPropagation()}>
        <CardContent className="flex flex-col gap-4 pt-6">
          <h3 className="text-base font-semibold">{mode === "edit" ? "Editar categoría" : "Nueva categoría"}</h3>
          <form action={action} onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "edit" && initial && <input type="hidden" name="id" value={initial.id} />}

            <div className="flex flex-col gap-1">
              <label htmlFor="categoryName" className="text-sm font-medium">
                Nombre
              </label>
              <Input id="categoryName" name="name" maxLength={40} defaultValue={initial?.name ?? ""} required />
            </div>

            {mode === "create" && (
              <>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Tipo</span>
                  <Select name="kind" value={kind} onValueChange={(v) => setKind(v as CategoryKind)}>
                    <SelectTrigger aria-label="Tipo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">Gasto</SelectItem>
                      <SelectItem value="income">Ingreso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Categoría padre</span>
                  <Select
                    value={parentId ?? NO_PARENT}
                    onValueChange={(v) => setParentId(v === NO_PARENT ? null : v)}
                  >
                    <SelectTrigger aria-label="Categoría padre">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PARENT}>Ninguna (nivel superior)</SelectItem>
                      {topLevelParents.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="parentId" value={parentId ?? ""} />
                </div>
              </>
            )}

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Ícono</span>
              <IconPicker value={icon} onChange={setIcon} />
              <input type="hidden" name="icon" value={icon ?? ""} />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Color</span>
              <ColorPicker value={color} onChange={setColor} />
              <input type="hidden" name="color" value={color ?? ""} />
            </div>

            {shapeError && <p className="text-xs text-expense">{shapeError}</p>}
            {state.error && <p className="text-sm text-expense">{state.error}</p>}

            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={pending || !!shapeError}>
                {pending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
