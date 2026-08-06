"use client";

import * as React from "react";
import { CATEGORY_ICONS, type CategoryIconKey } from "@/design-system/tokens/category-style";
import { cn } from "@/design-system/ui/utils";

const ICON_KEYS = Object.keys(CATEGORY_ICONS) as CategoryIconKey[];

/**
 * Registry-driven icon grid (design.md §5, change: finance-categories-icon-color C-014):
 * radio semantics over `CATEGORY_ICONS` only — there is no free-text or dynamic icon input
 * anywhere in this component, which is how the "picker only offers registry values" scenario
 * holds structurally. Keyboard-navigable via native button focus/Enter/Space.
 */
export function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (key: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Ícono" className="grid grid-cols-6 gap-2">
      {ICON_KEYS.map((key) => {
        const Icon = CATEGORY_ICONS[key];
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
              "flex h-10 w-10 items-center justify-center rounded-card border border-input bg-surface text-foreground transition-colors duration-200 ease-out",
              checked && "border-ring bg-accent",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
