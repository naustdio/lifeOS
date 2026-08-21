"use client";

import { useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Input } from "@/design-system/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-system/ui/select";

export type AddLooseItemInput = {
  name: string;
  quantity: number | null;
  unit: string;
  estimatedUnitCost: number | null;
  storeTypeId: string | null;
  originRecipeId: null;
  originRecipeTitle: null;
};

/**
 * Manual item entry form (design.md File Changes, spec `shopping-list-continuous` "Loose Manual
 * Items"). Always writes a null recipe origin — recipe-origin items are added exclusively via
 * `generateFromRecipesAction` (PR 5), never through this form. Store type is optional here and
 * only offers the household's already-existing types (PR 4 adds the "create a new store type"
 * flow); resolution to a household default happens server-side in `actions.ts`.
 */
export function AddLooseItemForm({
  storeTypes,
  onAdd,
  onCreateStoreType,
}: {
  storeTypes: { id: string; name: string }[];
  onAdd: (input: AddLooseItemInput) => Promise<{ error: string | null }>;
  onCreateStoreType: (name: string) => Promise<{ error: string | null }>;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [estimatedUnitCost, setEstimatedUnitCost] = useState("");
  const [storeTypeId, setStoreTypeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [newStoreTypeName, setNewStoreTypeName] = useState("");
  const [creatingStoreType, setCreatingStoreType] = useState(false);
  const [createStoreTypeError, setCreateStoreTypeError] = useState<string | null>(null);

  async function handleCreateStoreType(e: React.FormEvent) {
    e.preventDefault();
    if (!newStoreTypeName.trim()) return;

    setCreatingStoreType(true);
    setCreateStoreTypeError(null);
    const { error: createError } = await onCreateStoreType(newStoreTypeName.trim());
    setCreatingStoreType(false);

    if (createError) {
      setCreateStoreTypeError(createError);
      return;
    }
    setNewStoreTypeName("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !unit.trim()) {
      setError("Completa el nombre y la unidad.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await onAdd({
      name: name.trim(),
      quantity: quantity.trim() === "" ? null : Number(quantity),
      unit: unit.trim(),
      estimatedUnitCost: estimatedUnitCost.trim() === "" ? null : Number(estimatedUnitCost),
      storeTypeId,
      originRecipeId: null,
      originRecipeTitle: null,
    });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setName("");
    setQuantity("");
    setUnit("");
    setEstimatedUnitCost("");
    setStoreTypeId(null);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-card border border-border/60 bg-card p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="looseItemName" className="text-xs font-medium text-muted-foreground">
          Nombre
        </label>
        <Input id="looseItemName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Papel higiénico" />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="looseItemQuantity" className="text-xs font-medium text-muted-foreground">
            Cantidad
          </label>
          <Input id="looseItemQuantity" type="number" step="0.01" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="looseItemUnit" className="text-xs font-medium text-muted-foreground">
            Unidad
          </label>
          <Input id="looseItemUnit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Ej. pieza" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="looseItemCost" className="text-xs font-medium text-muted-foreground">
            Costo estimado (opcional)
          </label>
          <Input
            id="looseItemCost"
            type="number"
            step="0.01"
            min="0"
            value={estimatedUnitCost}
            onChange={(e) => setEstimatedUnitCost(e.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="looseItemStoreType" className="text-xs font-medium text-muted-foreground">
            Tienda (opcional)
          </label>
          <Select value={storeTypeId ?? ""} onValueChange={(v) => setStoreTypeId(v || null)}>
            <SelectTrigger id="looseItemStoreType">
              <SelectValue placeholder="Sin categoría" />
            </SelectTrigger>
            <SelectContent>
              {storeTypes.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="newStoreTypeName" className="text-xs font-medium text-muted-foreground">
            Nueva tienda (opcional)
          </label>
          <Input
            id="newStoreTypeName"
            value={newStoreTypeName}
            onChange={(e) => setNewStoreTypeName(e.target.value)}
            placeholder="Ej. Panadería"
          />
        </div>
        <Button type="button" variant="secondary" disabled={creatingStoreType || !newStoreTypeName.trim()} onClick={handleCreateStoreType}>
          Crear tienda
        </Button>
      </div>
      {createStoreTypeError && <p className="text-xs text-destructive">{createStoreTypeError}</p>}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button type="submit" disabled={submitting}>
        Agregar
      </Button>
    </form>
  );
}
