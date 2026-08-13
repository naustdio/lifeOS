// Pure TypeScript unit picklist for `recipe_ingredients.unit` (design.md Decision 4). This list
// MUST stay in lockstep with `recipes.is_builtin_unit`'s array literal
// (migration `20260813090040_recipes_api.sql`) — the DB seam only persists a submitted unit into
// `recipes.custom_units` when it's NOT in that same 14-value list.

export type UnitOption = { value: string; label: string; icon: string; isCustom?: boolean };

const NEUTRAL_CUSTOM_ICON = "•";

export const RECIPE_UNITS: readonly UnitOption[] = [
  { value: "g", label: "Gramo (g)", icon: "⚖️" },
  { value: "kg", label: "Kilogramo (kg)", icon: "⚖️" },
  { value: "ml", label: "Mililitro (ml)", icon: "🥤" },
  { value: "l", label: "Litro (l)", icon: "🥤" },
  { value: "taza", label: "Taza", icon: "☕" },
  { value: "cucharada", label: "Cucharada", icon: "🥄" },
  { value: "cucharadita", label: "Cucharadita", icon: "🥄" },
  { value: "pieza", label: "Pieza", icon: "🔢" },
  { value: "pizca", label: "Pizca", icon: "🧂" },
  { value: "oz", label: "Onza (oz)", icon: "⚖️" },
  { value: "lb", label: "Libra (lb)", icon: "⚖️" },
  { value: "diente", label: "Diente", icon: "🧄" },
  { value: "manojo", label: "Manojo", icon: "🌿" },
  { value: "al gusto", label: "Al gusto", icon: "✨" },
];

const BUILTIN_VALUES = new Set(RECIPE_UNITS.map((u) => u.value));

/** Built-in list (kept in its fixed order) plus any distinct custom unit not already present,
 *  de-duplicated, custom units carrying the neutral fallback icon (design.md Decision 4 —
 *  "icons are presentation, they belong beside the constant, not in a row the user can't pick an
 *  icon for"). */
export function mergeUnitOptions(builtIn: readonly UnitOption[], customUnits: readonly string[]): UnitOption[] {
  const seen = new Set(builtIn.map((u) => u.value));
  const extras: UnitOption[] = [];
  for (const value of customUnits) {
    if (seen.has(value) || BUILTIN_VALUES.has(value)) continue;
    seen.add(value);
    extras.push({ value, label: value, icon: NEUTRAL_CUSTOM_ICON, isCustom: true });
  }
  return [...builtIn, ...extras];
}
