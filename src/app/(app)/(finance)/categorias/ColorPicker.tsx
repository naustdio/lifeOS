"use client";

import * as React from "react";
import { CATEGORY_COLORS, type CategoryColorKey } from "@/design-system/tokens/category-style";
import { cn } from "@/design-system/ui/utils";

const COLOR_KEYS = Object.keys(CATEGORY_COLORS) as CategoryColorKey[];

/**
 * Registry-driven swatch row (design.md §5, change: finance-categories-icon-color C-015):
 * radio semantics over `CATEGORY_COLORS` only — no free-text or hex input anywhere in this
 * component. Each swatch uses the same `surface` class the resolved chip would render, so the
 * picker preview matches the eventual `CategoryChip` rendering exactly.
 */
export function ColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (key: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
      {COLOR_KEYS.map((key) => {
        const checked = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={key}
            onClick={() => onChange(key)}
            className={cn(
              "h-8 w-8 rounded-full border-2 border-transparent",
              CATEGORY_COLORS[key].surface,
              checked && "border-ring",
            )}
          />
        );
      })}
    </div>
  );
}
