// Pure, read/render-time aggregation of exploded `shopping_list.items` rows into combined display
// lines (design.md "Combining algorithm", spec `shopping-list-recipe-intake` "Quantity Combining
// With Origin Breakdown"). Zero Supabase/framework imports — items are stored exploded (one row
// per contributing origin); this is the ONLY place combination happens.

export type ShoppingListItemRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  estimatedUnitCost: number | null;
  storeTypeId: string | null;
  isChecked: boolean;
  originRecipeTitle: string | null;
  createdAt: string;
};

export type CombinedLineContributor = {
  itemId: string;
  originLabel: string;
  quantity: number | null;
};

export type CombinedLine = {
  key: string;
  name: string;
  unit: string;
  /** Sum of every contributor's quantity, or null only when EVERY contributor is null ("al
   *  gusto") — a single null contributor never poisons a real total. */
  totalQuantity: number | null;
  /** Sum of quantity * estimatedUnitCost over priced contributors only; null when none priced. */
  estimatedCost: number | null;
  /** First non-null contributor wins (item-row override precedence, design.md Decision 1). */
  storeTypeId: string | null;
  allChecked: boolean;
  contributors: CombinedLineContributor[];
};

function combineKey(name: string, unit: string): string {
  return `${name.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;
}

/** Same name + same unit combine into one line with a per-origin contributor breakdown; a
 *  different unit is a different key ⇒ a separate line, never converted (spec: "Same name,
 *  different units stay separate, no conversion"). Group order is stable by each group's earliest
 *  `createdAt` so checking an item never reorders the list. */
export function combineItems(items: readonly ShoppingListItemRow[]): CombinedLine[] {
  const groups = new Map<string, ShoppingListItemRow[]>();
  for (const item of items) {
    const key = combineKey(item.name, item.unit);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const lines = [...groups.entries()].map(([key, group]) => {
    const ordered = [...group].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    const earliest = ordered[0]!;

    const allNullQuantity = ordered.every((i) => i.quantity === null);
    const totalQuantity = allNullQuantity ? null : ordered.reduce((sum, i) => sum + (i.quantity ?? 0), 0);

    const pricedContributions = ordered.filter((i) => i.quantity !== null && i.estimatedUnitCost !== null);
    const estimatedCost =
      pricedContributions.length === 0 ? null : pricedContributions.reduce((sum, i) => sum + i.quantity! * i.estimatedUnitCost!, 0);

    const firstStoreTypeId = ordered.find((i) => i.storeTypeId !== null)?.storeTypeId ?? null;

    return {
      key,
      earliestCreatedAt: earliest.createdAt,
      line: {
        key,
        name: earliest.name,
        unit: earliest.unit,
        totalQuantity,
        estimatedCost,
        storeTypeId: firstStoreTypeId,
        allChecked: ordered.every((i) => i.isChecked),
        contributors: ordered.map((i) => ({
          itemId: i.id,
          originLabel: i.originRecipeTitle ?? "manual",
          quantity: i.quantity,
        })),
      } satisfies CombinedLine,
    };
  });

  return lines
    .sort((a, b) => (a.earliestCreatedAt < b.earliestCreatedAt ? -1 : a.earliestCreatedAt > b.earliestCreatedAt ? 1 : 0))
    .map((l) => l.line);
}
