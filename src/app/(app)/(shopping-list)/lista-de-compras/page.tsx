import { getCurrentHouseholdId } from "@/modules/core/api";
import { combineItems, ensureBaseStoreTypes, estimatedTotal, getOrCreateActiveList, listItems, listStoreTypes } from "@/modules/shopping-list/api";
import { createClient } from "@/shared/supabase/server";
import { addLooseItemAction, createStoreTypeAction, finalizeAction, removeItemAction, setCheckedAction } from "./actions";
import { ShoppingListView, type ShoppingListViewLine } from "./ShoppingListView";

/**
 * Server container for the continuous shopping list (design.md File Changes, tasks.md 3.10).
 * Gets/creates the household's single active list, reads its exploded items + the household's
 * store types, then combines the items into display lines (`combineItems()`, PR 2) BEFORE
 * handing them to the client view — the client never sees raw exploded rows.
 */
export default async function ListaDeComprasPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);

  const list = spaceId ? await getOrCreateActiveList(supabase, spaceId) : null;
  if (spaceId) await ensureBaseStoreTypes(supabase, spaceId);
  const [items, storeTypes] = list
    ? await Promise.all([listItems(supabase, list.id), listStoreTypes(supabase, spaceId!)])
    : [[], []];

  const lines: ShoppingListViewLine[] = combineItems(items).map((line) => ({
    key: line.key,
    name: line.name,
    unit: line.unit,
    totalQuantity: line.totalQuantity,
    estimatedCost: line.estimatedCost,
    storeTypeId: line.storeTypeId,
    checked: line.allChecked,
    contributors: line.contributors,
  }));

  const total = estimatedTotal(items);

  return (
    <main className="flex flex-col gap-6 pb-24">
      <ShoppingListView
        initialLines={lines}
        storeTypes={storeTypes.map((s) => ({ id: s.id, name: s.name }))}
        estimatedTotal={total}
        onAddItem={addLooseItemAction}
        onToggleItem={setCheckedAction}
        onRemoveItem={removeItemAction}
        onFinalize={finalizeAction}
        onCreateStoreType={createStoreTypeAction}
      />
    </main>
  );
}
