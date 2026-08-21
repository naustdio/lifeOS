"use client";

import { Check, X } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";

export type ShoppingItemRowContributor = {
  itemId: string;
  /** Recipe title, or "manual" for a loose item (design.md combine algorithm). */
  originLabel: string;
  quantity: number | null;
};

/**
 * One combined shopping-list line (design.md "Combining algorithm" — `domain/combine.ts`'s
 * `CombinedLine`, locally-declared here per the `IngredientRow.tsx` convention: a pattern
 * component never imports a module's domain type directly, its caller maps plain data in).
 *
 * Checking strikes the row through IN PLACE (spec `shopping-list-continuous` "In-Place
 * Strike-Through Check-Off") — this component never moves itself to a separate section; the
 * caller (`ShoppingListView`) keeps it at the same list position regardless of `checked`. The
 * origin sub-line only renders with 2+ contributors (design.md: "the sub-line renders only when
 * `contributors.length > 1`") since a single-contributor line's origin is implied by context.
 */
export function ShoppingItemRow({
  name,
  unit,
  totalQuantity,
  estimatedCost,
  checked,
  contributors,
  onToggle,
  onRemove,
}: {
  name: string;
  unit: string;
  totalQuantity: number | null;
  estimatedCost: number | null;
  checked: boolean;
  contributors: ShoppingItemRowContributor[];
  onToggle: () => void;
  onRemove: () => void;
}) {
  const quantityLabel = totalQuantity === null ? "al gusto" : `${totalQuantity} ${unit}`.trim();

  return (
    <div
      className={cn(
        "group flex items-center gap-3 py-3 transition-colors duration-200 ease-out hover:bg-accent/60 -mx-2 px-2 rounded-card",
        checked && "opacity-60",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`Marcar ${name}`}
        onClick={onToggle}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-pill border border-input transition-colors duration-200 ease-out",
          checked ? "border-primary bg-primary text-primary-foreground" : "bg-surface",
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" aria-hidden />}
      </button>

      <div className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-medium", checked && "line-through text-muted-foreground")}>{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{quantityLabel}</span>
        {contributors.length > 1 && (
          <span className="block truncate text-xs text-muted-foreground">{contributors.map((c) => c.originLabel).join(", ")}</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {estimatedCost !== null && <span className="text-xs text-muted-foreground">${estimatedCost.toFixed(2)}</span>}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onRemove}
          aria-label={`Quitar ${name}`}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
