/**
 * Group header for a store-type section in the shopping list (design.md "Key files"; spec
 * `shopping-list-store-types` "Items Grouped by Store Type in the UI"). Locally-declared props,
 * same convention as `ShoppingItemRow.tsx` — a pattern component never imports a module's domain
 * type directly, its caller maps plain data in. The subtotal only renders when non-null, mirroring
 * `domain/combine.ts`'s "null only when nothing in the group is priced" convention.
 */
export function StoreTypeGroupHeader({ name, subtotal }: { name: string; subtotal: number | null }) {
  return (
    <div className="flex items-center justify-between pb-1 pt-4 first:pt-0">
      <h3 className="text-sm font-semibold text-foreground">{name}</h3>
      {subtotal !== null && <span className="text-xs text-muted-foreground">${subtotal.toFixed(2)}</span>}
    </div>
  );
}
