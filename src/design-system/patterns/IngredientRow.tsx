"use client";

import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Camera, Check, Hash, Pencil, Scale, Smile, Type, UtensilsCrossed, X } from "lucide-react";
import { cn } from "@/design-system/ui/utils";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/design-system/ui/button";
import { Input } from "@/design-system/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-system/ui/select";

/**
 * One ingredient row for `RecipeForm` — quantity + unit select + name, with a remove button
 * (recipes-module design.md File Changes). Locally-declared props, zero module imports (same
 * `design-system → design-system | shared` boundary `MetricTrendChart.tsx`/`PhotoPickerGrid.tsx`
 * already satisfy) — the caller maps its own `UnitOption[]`/`IngredientCatalogOption[]` in from
 * `@/modules/recipes/api` and wires `onAttachPhoto`/`onSetIcon` to real Server Actions, since this
 * component may never import them directly.
 *
 * Ingredient catalog (UI-polish fast-follow): typing a name shows autocomplete suggestions from
 * the household's growing catalog of previously-used ingredients; picking one reuses its photo or
 * icon. A brand-new name can have a photo uploaded (client-side object-URL preview, matching
 * `PhotoPickerGrid.tsx`'s convention — the real upload happens via `onAttachPhoto`) or an emoji
 * icon picked, both attached to the household's catalog for reuse on future recipes.
 *
 * The unit field is a fixed picklist BY DEFAULT, with a free-text fallback for a unit outside the
 * list (settled decision, grilling round). Starts in text mode automatically if the row's initial
 * `unit` isn't one of the known options.
 *
 * Sub-recipe ingredients (settled via grill-me interview): a "texto libre" / "usar una receta"
 * toggle switches the name field between free typing and picking another household recipe from
 * `recipeOptions` — mutually exclusive, never both. `recipeOptions` is pre-filtered by the caller
 * to the "complemento" category (also re-validated server-side in the write seam) — sub-recipes
 * are meant to be reusable components (salsas, aderezos), not full standalone dishes. Picking a
 * recipe snapshots its title into `name` (consistent with how every other ingredient name is
 * stored) and sets `subRecipeId` for the link; quantity/unit still apply (e.g. "200 ml aderezo").
 * Starts in link mode automatically if the row's initial `subRecipeId` is set.
 *
 * Accordion behaviour: a row with a name already filled in starts/collapses into a flat summary
 * row (photo, name, qty/unit, edit + remove) — click the pencil (or the row) to expand. A
 * brand-new blank row starts expanded. Uses `motion`'s shared-layout `layout`/`layoutId` so the
 * row visually morphs between the compact summary and the expanded card.
 */
export type IngredientRowUnitOption = { value: string; label: string; icon: string };
export type IngredientCatalogOption = { name: string; photoUrl: string | null; icon: string | null };
export type IngredientRowRecipeOption = { id: string; title: string };

const springTransition = { type: "spring" as const, bounce: 0, duration: 0.5 };
const ICON_CHOICES = ["🍎", "🥕", "🥩", "🥛", "🧅", "🍞", "🧄", "🍚", "🧀", "🥚", "🌶️", "🍋"];

export function IngredientRow({
  index,
  name,
  quantity,
  unit,
  subRecipeId,
  units,
  catalog,
  recipeOptions,
  onChange,
  onRemove,
  onAttachPhoto,
  onSetIcon,
}: {
  index: number;
  name: string;
  quantity: string;
  unit: string;
  subRecipeId: string | null;
  units: IngredientRowUnitOption[];
  catalog: IngredientCatalogOption[];
  recipeOptions: IngredientRowRecipeOption[];
  onChange: (patch: { name?: string; quantity?: string; unit?: string; subRecipeId?: string | null }) => void;
  onRemove: () => void;
  onAttachPhoto: (file: File) => Promise<{ error: string | null }>;
  onSetIcon: (icon: string) => Promise<{ error: string | null }>;
}) {
  const [customMode, setCustomMode] = useState(() => unit.length > 0 && !units.some((u) => u.value === unit));
  const [collapsed, setCollapsed] = useState(() => name.trim().length > 0);
  const [linkMode, setLinkMode] = useState(() => subRecipeId !== null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const initialMatch = catalog.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(initialMatch?.photoUrl ?? null);
  const [icon, setIconState] = useState<string | null>(initialMatch?.icon ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const iconButtonClass = "shrink-0 rounded-full bg-secondary text-secondary-foreground hover:opacity-80";
  const fieldLabelClass = "flex w-24 shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground";
  const unitOption = units.find((u) => u.value === unit);
  const unitSummary = unit ? (unitOption?.label ?? unit) : null;
  const nameLayoutId = `ingredient-name-${index}`;

  const suggestions = useMemo(() => {
    const query = name.trim().toLowerCase();
    if (!query) return [];
    return catalog.filter((c) => c.name.toLowerCase().includes(query) && c.name.toLowerCase() !== query).slice(0, 5);
  }, [catalog, name]);

  function pickSuggestion(option: IngredientCatalogOption) {
    onChange({ name: option.name });
    setPhotoPreviewUrl(option.photoUrl);
    setIconState(option.icon);
    setShowSuggestions(false);
  }

  async function handleFileSelected(file: File | undefined) {
    if (!file) return;
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setIconState(null);
    await onAttachPhoto(file);
  }

  async function handlePickIcon(nextIcon: string) {
    setIconState(nextIcon);
    setPhotoPreviewUrl(null);
    setShowIconPicker(false);
    await onSetIcon(nextIcon);
  }

  const avatar = photoPreviewUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- local/signed object URL preview, not an optimizable static asset
    <img src={photoPreviewUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-lg">{icon ?? unitOption?.icon ?? "🥣"}</span>
  );

  return (
    <motion.div layout transition={springTransition} className="overflow-hidden rounded-card border border-border/60 bg-card">
      <AnimatePresence mode="popLayout" initial={false}>
        {collapsed ? (
          <motion.div key="collapsed" layout="position" transition={springTransition} className="flex items-center gap-3 p-3">
            {avatar}
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

            <div className="flex items-center gap-3">
              {avatar}
              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handleFileSelected(e.target.files?.[0])}
                  aria-label={`Foto de ingrediente ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 rounded-pill"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="h-3.5 w-3.5" aria-hidden />
                  Foto
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 rounded-pill"
                  onClick={() => setShowIconPicker((v) => !v)}
                  aria-expanded={showIconPicker}
                >
                  <Smile className="h-3.5 w-3.5" aria-hidden />
                  Ícono
                </Button>
              </div>
            </div>

            {showIconPicker && (
              <div className="flex flex-wrap gap-1.5 rounded-card bg-secondary/50 p-2">
                {ICON_CHOICES.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => handlePickIcon(choice)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-base hover:bg-secondary"
                    aria-label={`Usar ícono ${choice}`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5 self-start rounded-pill bg-secondary/60 p-1">
              <button
                type="button"
                onClick={() => {
                  if (!linkMode) return;
                  setLinkMode(false);
                  onChange({ subRecipeId: null });
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium transition-colors",
                  !linkMode ? "bg-card shadow-soft-sm" : "text-muted-foreground",
                )}
              >
                <Type className="h-3.5 w-3.5" aria-hidden />
                Texto libre
              </button>
              <button
                type="button"
                onClick={() => {
                  if (linkMode) return;
                  setLinkMode(true);
                  onChange({ name: "", subRecipeId: null });
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium transition-colors",
                  linkMode ? "bg-card shadow-soft-sm" : "text-muted-foreground",
                )}
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                Usar una receta
              </button>
            </div>

            {linkMode ? (
              <div className="flex items-center gap-2">
                <label htmlFor={`ingredientSubRecipe_${index}`} className={fieldLabelClass}>
                  <BookOpen className="h-4 w-4" aria-hidden />
                  Receta
                </label>
                <Select
                  value={subRecipeId ?? ""}
                  onValueChange={(v) => {
                    const picked = recipeOptions.find((r) => r.id === v);
                    onChange({ subRecipeId: v, name: picked?.title ?? "" });
                  }}
                >
                  <SelectTrigger id={`ingredientSubRecipe_${index}`} className="min-w-0 flex-1 rounded-pill">
                    <SelectValue placeholder="Elige una receta" />
                  </SelectTrigger>
                  <SelectContent>
                    {recipeOptions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="relative flex items-center gap-2">
                <label htmlFor={`ingredientName_${index}`} className={fieldLabelClass}>
                  <UtensilsCrossed className="h-4 w-4" aria-hidden />
                  Ingrediente
                </label>
                <Input
                  id={`ingredientName_${index}`}
                  value={name}
                  onChange={(e) => {
                    onChange({ name: e.target.value });
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Ej. Tortilla de maíz"
                  autoComplete="off"
                  required
                  className="min-w-0 flex-1 rounded-pill"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="absolute top-full left-24 z-10 mt-1 flex w-[calc(100%-6rem)] flex-col overflow-hidden rounded-card border border-border bg-card shadow-soft-lg">
                    {suggestions.map((s) => (
                      <li key={s.name}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickSuggestion(s)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          {s.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- signed thumbnail preview
                            <img src={s.photoUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                          ) : (
                            <span className="text-base">{s.icon ?? "🥣"}</span>
                          )}
                          {s.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

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
