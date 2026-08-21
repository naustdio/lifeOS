"use client";

import { ShoppingCart } from "lucide-react";
import { useState } from "react";
import { Button } from "@/design-system/ui/button";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { ShoppingItemRow, type ShoppingItemRowContributor } from "@/design-system/patterns/ShoppingItemRow";
import { StoreTypeGroupHeader } from "@/design-system/patterns/StoreTypeGroupHeader";
import { AddLooseItemForm, type AddLooseItemInput } from "./AddLooseItemForm";

export type ShoppingListViewLine = {
  key: string;
  name: string;
  unit: string;
  totalQuantity: number | null;
  estimatedCost: number | null;
  storeTypeId: string | null;
  checked: boolean;
  contributors: ShoppingItemRowContributor[];
};

const UNASSIGNED_GROUP_KEY = "unassigned";
const UNASSIGNED_GROUP_LABEL = "Sin categoría";

/** Groups combined lines by `storeTypeId`, preserving `storeTypes`' own order and appending the
 * "Sin categoría" bucket last (spec `shopping-list-store-types` "Unassigned items are not
 * hidden") — never dropped, always rendered as its own distinct group. Only non-empty groups are
 * returned. */
function groupLinesByStoreType(
  lines: ShoppingListViewLine[],
  storeTypes: { id: string; name: string }[],
): { key: string; name: string; subtotal: number | null; lines: ShoppingListViewLine[] }[] {
  const byStoreType = new Map<string, ShoppingListViewLine[]>();
  for (const line of lines) {
    const key = line.storeTypeId ?? UNASSIGNED_GROUP_KEY;
    const group = byStoreType.get(key);
    if (group) group.push(line);
    else byStoreType.set(key, [line]);
  }

  const orderedGroups = [
    ...storeTypes.map((s) => ({ key: s.id, name: s.name })),
    { key: UNASSIGNED_GROUP_KEY, name: UNASSIGNED_GROUP_LABEL },
  ];

  return orderedGroups
    .map(({ key, name }) => {
      const groupLines = byStoreType.get(key) ?? [];
      return { key, name, subtotal: groupSubtotal(groupLines), lines: groupLines };
    })
    .filter((group) => group.lines.length > 0);
}

/** Sum of every priced line's `estimatedCost` in the group, or null when none are priced —
 * mirrors `domain/combine.ts`'s own "null only when nothing is priced" convention. */
function groupSubtotal(lines: ShoppingListViewLine[]): number | null {
  const priced = lines.filter((l) => l.estimatedCost !== null);
  if (priced.length === 0) return null;
  return priced.reduce((sum, l) => sum + l.estimatedCost!, 0);
}

/**
 * Client container for the continuous shopping list (design.md File Changes). Renders
 * `combineItems()`'s output FLAT — store-type grouping is PR 4's addition, not this slice's.
 * Optimistically updates local state on check/remove/finalize so the UI reacts immediately, while
 * the real mutation runs through the passed-in Server Action wrapper (`actions.ts`); a failed
 * mutation reverts the optimistic change. "Finalizar compra" (spec `shopping-list-continuous`
 * "Explicit Clear via 'Finalizar compra'") is the ONLY clear trigger on this page — checking every
 * item is deliberately a no-op for clearing (same spec, "Checking all items does not clear").
 */
export function ShoppingListView({
  initialLines,
  storeTypes,
  estimatedTotal,
  onAddItem,
  onToggleItem,
  onRemoveItem,
  onFinalize,
  onCreateStoreType,
}: {
  initialLines: ShoppingListViewLine[];
  storeTypes: { id: string; name: string }[];
  estimatedTotal: number | null;
  onAddItem: (input: AddLooseItemInput) => Promise<{ error: string | null }>;
  onToggleItem: (itemIds: string[], checked: boolean) => Promise<{ error: string | null }>;
  onRemoveItem: (itemIds: string[]) => Promise<{ error: string | null }>;
  onFinalize: () => Promise<{ error: string | null }>;
  onCreateStoreType: (name: string) => Promise<{ storeType: { id: string; name: string } | null; error: string | null }>;
}) {
  const [lines, setLines] = useState(initialLines);
  const [storeTypeOptions, setStoreTypeOptions] = useState(storeTypes);
  const [finalizing, setFinalizing] = useState(false);

  async function handleToggle(line: ShoppingListViewLine) {
    const nextChecked = !line.checked;
    setLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, checked: nextChecked } : l)));
    const { error } = await onToggleItem(
      line.contributors.map((c) => c.itemId),
      nextChecked,
    );
    if (error) {
      setLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, checked: line.checked } : l)));
    }
  }

  async function handleRemove(line: ShoppingListViewLine) {
    setLines((prev) => prev.filter((l) => l.key !== line.key));
    const { error } = await onRemoveItem(line.contributors.map((c) => c.itemId));
    if (error) {
      setLines((prev) => [...prev, line]);
    }
  }

  async function handleFinalize() {
    setFinalizing(true);
    const { error } = await onFinalize();
    setFinalizing(false);
    if (!error) setLines([]);
  }

  async function handleCreateStoreType(name: string): Promise<{ error: string | null }> {
    const { storeType, error } = await onCreateStoreType(name);
    if (storeType) setStoreTypeOptions((prev) => [...prev, storeType]);
    return { error };
  }

  const groups = groupLinesByStoreType(lines, storeTypeOptions);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Lista de compras</h2>
        {estimatedTotal !== null && <span className="text-sm text-muted-foreground">Total estimado: ${estimatedTotal.toFixed(2)}</span>}
      </div>

      {lines.length === 0 ? (
        <EmptyState icon={ShoppingCart} heading="Tu lista está vacía" description="Agrega un artículo manual para empezar." />
      ) : (
        <div className="flex flex-col">
          {groups.map((group) => (
            <div key={group.key}>
              <StoreTypeGroupHeader name={group.name} subtotal={group.subtotal} />
              <div className="flex flex-col divide-y divide-border/60">
                {group.lines.map((line) => (
                  <ShoppingItemRow
                    key={line.key}
                    name={line.name}
                    unit={line.unit}
                    totalQuantity={line.totalQuantity}
                    estimatedCost={line.estimatedCost}
                    checked={line.checked}
                    contributors={line.contributors}
                    onToggle={() => handleToggle(line)}
                    onRemove={() => handleRemove(line)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddLooseItemForm storeTypes={storeTypeOptions} onAdd={onAddItem} onCreateStoreType={handleCreateStoreType} />

      <Button type="button" variant="secondary" disabled={finalizing} onClick={handleFinalize}>
        Finalizar compra
      </Button>
    </div>
  );
}
