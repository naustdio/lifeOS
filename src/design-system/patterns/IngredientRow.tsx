"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Pencil, X } from "lucide-react";
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
 * one-line summary — icon, name, "qty unit" — click to expand back into the editable fields. A
 * brand-new blank row (just added via "Agregar ingrediente") starts expanded since there's
 * nothing to summarize yet. Uses `motion`'s shared-layout `layoutId` on the icon and name (user
 * reference: an inline-table-edit component using the same technique) so the row visually morphs
 * between the compact summary and the expanded card instead of an abrupt show/hide.
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
  const unitOption = units.find((u) => u.value === unit);
  const unitSummary = unit ? (unitOption?.label ?? unit) : null;
  const iconLayoutId = `ingredient-icon-${index}`;
  const nameLayoutId = `ingredient-name-${index}`;

  return (
    <motion.div layout transition={springTransition} className="overflow-hidden rounded-card border border-border/60 bg-card">
      <AnimatePresence mode="popLayout" initial={false}>
        {collapsed ? (
          <motion.div key="collapsed" layout="position" transition={springTransition} className="flex items-center gap-3 p-3">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-expanded={false}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <motion.span
                layoutId={iconLayoutId}
                transition={springTransition}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-base"
              >
                {unitOption?.icon ?? "🥣"}
              </motion.span>
              <span className="min-w-0 flex-1">
                <motion.span layoutId={nameLayoutId} transition={springTransition} className="block truncate text-sm font-medium">
                  {name.trim() || `Ingrediente ${index + 1}`}
                </motion.span>
                {(quantity || unitSummary) && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {quantity ? `${quantity} ` : ""}
                    {unitSummary ?? ""}
                  </span>
                )}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>

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
          <motion.div key="expanded" layout transition={springTransition} className="flex flex-col gap-3 p-3">
            <div className="flex items-center gap-3">
              <motion.span
                layoutId={iconLayoutId}
                transition={springTransition}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-base"
              >
                {unitOption?.icon ?? "🥣"}
              </motion.span>
              <motion.span layoutId={nameLayoutId} transition={springTransition} className="min-w-0 flex-1 truncate text-sm font-medium">
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

            <div className="flex flex-col gap-1">
              <label htmlFor={`ingredientName_${index}`} className="text-xs font-medium text-muted-foreground">
                Ingrediente
              </label>
              <Input
                id={`ingredientName_${index}`}
                value={name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="Ej. Tortilla de maíz"
                required
              />
            </div>

            <div className="flex items-end gap-2">
              <div className="flex w-20 shrink-0 flex-col gap-1">
                <label htmlFor={`ingredientQuantity_${index}`} className="text-xs font-medium text-muted-foreground">
                  Cant.
                </label>
                <Input
                  id={`ingredientQuantity_${index}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={quantity}
                  onChange={(e) => onChange({ quantity: e.target.value })}
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor={`ingredientUnit_${index}`} className="text-xs font-medium text-muted-foreground">
                  Unidad
                </label>
                {customMode ? (
                  <div className="flex items-center gap-2">
                    <Input
                      id={`ingredientUnit_${index}`}
                      value={unit}
                      placeholder="Unidad nueva"
                      onChange={(e) => onChange({ unit: e.target.value })}
                      className="min-w-0 flex-1"
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
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Select value={unit} onValueChange={(v) => onChange({ unit: v })}>
                      <SelectTrigger id={`ingredientUnit_${index}`} className="min-w-0 flex-1">
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
                  </div>
                )}
              </div>
            </div>

            <Button type="button" variant="secondary" className="w-full justify-center gap-2" onClick={() => setCollapsed(true)}>
              <Check className="h-4 w-4" aria-hidden />
              Listo
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
