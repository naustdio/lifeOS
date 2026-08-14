"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Hash, Pencil, Scale, UtensilsCrossed, X } from "lucide-react";
import { cn } from "@/design-system/ui/utils";
import { useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Input } from "@/design-system/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-system/ui/select";

/**
 * One ingredient row for `RecipeForm` — quantity + unit select + name, with a remove button
 * (recipes-module design.md File Changes). Locally-declared props, zero module imports (same
 * `design-system → design-system | shared` boundary `MetricTrendChart.tsx`/`PhotoPickerGrid.tsx`
 * already satisfy) — the caller maps its own `UnitOption[]` in from `@/modules/recipes/api`.
 *
 * The unit field is a fixed picklist BY DEFAULT, with a free-text fallback for a unit outside the
 * list (settled decision, grilling round: "lista fija por default... pero dejar un campo para
 * poder introducir nuevas"). Starts in text mode automatically if the row's initial `unit` isn't
 * one of the known options (e.g. editing a recipe that already used a custom unit).
 *
 * Accordion behaviour (UI-polish follow-up): a row with a name already filled in (an ingredient
 * loaded from an existing recipe, or one the user just finished typing) starts/collapses into a
 * flat summary row (name, qty/unit, edit + remove) — click the pencil (or the row) to expand back
 * into the editable fields. A brand-new blank row (just added via "Agregar ingrediente") starts
 * expanded since there's nothing to summarize yet. Uses `motion`'s shared-layout `layout`/
 * `layoutId` (user reference: an inline-table-edit component using the same technique) so the row
 * visually morphs between the compact summary and the expanded card instead of an abrupt
 * show/hide. Expanded fields use a label-left/pill-input-right layout, also per that reference.
 */
export type IngredientRowUnitOption = { value: string; label: string; icon: string };

const springTransition = { type: "spring" as const, bounce: 0, duration: 0.5 };

export function IngredientRow({
  index,
  name,
  quantity,
  unit,
  units,
  onChange,
  onRemove,
}: {
  index: number;
  name: string;
  quantity: string;
  unit: string;
  units: IngredientRowUnitOption[];
  onChange: (patch: { name?: string; quantity?: string; unit?: string }) => void;
  onRemove: () => void;
}) {
  const [customMode, setCustomMode] = useState(() => unit.length > 0 && !units.some((u) => u.value === unit));
  const [collapsed, setCollapsed] = useState(() => name.trim().length > 0);

  const iconButtonClass = "shrink-0 rounded-full bg-secondary text-secondary-foreground hover:opacity-80";
  const fieldLabelClass = "flex w-24 shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground";
  const unitOption = units.find((u) => u.value === unit);
  const unitSummary = unit ? (unitOption?.label ?? unit) : null;
  const nameLayoutId = `ingredient-name-${index}`;

  return (
    <motion.div layout transition={springTransition} className="overflow-hidden rounded-card border border-border/60 bg-card">
      <AnimatePresence mode="popLayout" initial={false}>
        {collapsed ? (
          <motion.div key="collapsed" layout="position" transition={springTransition} className="flex items-center gap-3 p-3">
            <button type="button" onClick={() => setCollapsed(false)} aria-expanded={false} className="min-w-0 flex-1 text-left">
              <motion.span layoutId={nameLayoutId} transition={springTransition} className="block truncate text-sm font-semibold">
                {name.trim() || `Ingrediente ${index + 1}`}
              </motion.span>
              {(quantity || unitSummary) && (
                <span className="block truncate text-xs text-muted-foreground">
                  {quantity ? `${quantity} ` : ""}
                  {unitSummary ?? ""}
                </span>
              )}
            </button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => setCollapsed(false)}
              aria-label={`Editar ingrediente ${index + 1}`}
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="icon"
              className={iconButtonClass}
              onClick={onRemove}
              aria-label={`Quitar ingrediente ${index + 1}`}
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </motion.div>
        ) : (
          <motion.div key="expanded" layout transition={springTransition} className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <motion.span layoutId={nameLayoutId} transition={springTransition} className="truncate text-sm font-semibold">
                {name.trim() || `Ingrediente ${index + 1}`}
              </motion.span>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className={iconButtonClass}
                onClick={onRemove}
                aria-label={`Quitar ingrediente ${index + 1}`}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor={`ingredientName_${index}`} className={fieldLabelClass}>
                <UtensilsCrossed className="h-4 w-4" aria-hidden />
                Ingrediente
              </label>
              <Input
                id={`ingredientName_${index}`}
                value={name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="Ej. Tortilla de maíz"
                required
                className="min-w-0 flex-1 rounded-pill"
              />
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor={`ingredientQuantity_${index}`} className={fieldLabelClass}>
                <Hash className="h-4 w-4" aria-hidden />
                Cant.
              </label>
              <Input
                id={`ingredientQuantity_${index}`}
                type="number"
                step="0.01"
                min="0"
                value={quantity}
                onChange={(e) => onChange({ quantity: e.target.value })}
                className="min-w-0 flex-1 rounded-pill"
              />
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor={`ingredientUnit_${index}`} className={fieldLabelClass}>
                <Scale className="h-4 w-4" aria-hidden />
                Unidad
              </label>
              {customMode ? (
                <>
                  <Input
                    id={`ingredientUnit_${index}`}
                    value={unit}
                    placeholder="Unidad nueva"
                    onChange={(e) => onChange({ unit: e.target.value })}
                    className="min-w-0 flex-1 rounded-pill"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className={cn(iconButtonClass, "h-9 w-9")}
                    onClick={() => {
                      setCustomMode(false);
                      onChange({ unit: units[0]?.value ?? "" });
                    }}
                    aria-label="Volver a la lista de unidades"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </>
              ) : (
                <>
                  <Select value={unit} onValueChange={(v) => onChange({ unit: v })}>
                    <SelectTrigger id={`ingredientUnit_${index}`} className="min-w-0 flex-1 rounded-pill">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u.value} value={u.value}>
                          {u.icon} {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className={cn(iconButtonClass, "h-9 w-9")}
                    onClick={() => {
                      setCustomMode(true);
                      onChange({ unit: "" });
                    }}
                    aria-label="Escribir una unidad nueva"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </>
              )}
            </div>

            <Button type="button" variant="secondary" className="mt-1 w-full justify-center gap-2 rounded-pill" onClick={() => setCollapsed(true)}>
              <Check className="h-4 w-4" aria-hidden />
              Listo
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
