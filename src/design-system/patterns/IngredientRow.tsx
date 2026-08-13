"use client";

import { ChevronDown, Pencil, X } from "lucide-react";
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
 * nothing to summarize yet. Plain React state + a CSS grid-rows transition, no animation library
 * — this repo has none installed and one row's collapse doesn't warrant adding one.
 */
export type IngredientRowUnitOption = { value: string; label: string; icon: string };

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

  return (
    <div className="flex flex-col rounded-card border border-border/60">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-base">
            {unitOption?.icon ?? "🥣"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name.trim() || `Ingrediente ${index + 1}`}</span>
            {(quantity || unitSummary) && (
              <span className="block truncate text-xs text-muted-foreground">
                {quantity ? `${quantity} ` : ""}
                {unitSummary ?? ""}
              </span>
            )}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !collapsed && "rotate-180")} aria-hidden />
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
      </div>

      <div className={cn("grid transition-all duration-200 ease-out", collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]")}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-2 px-3 pb-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`ingredientName_${index}`} className="text-xs font-medium text-muted-foreground">
                Ingrediente
              </label>
              <Input
                id={`ingredientName_${index}`}
                value={name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="Ej. Tortilla de maíz"
                required={!collapsed}
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
          </div>
        </div>
      </div>
    </div>
  );
}
