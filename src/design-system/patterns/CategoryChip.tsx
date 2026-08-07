import * as React from "react";
import { resolveCategoryColor, resolveCategoryIcon } from "../tokens/category-style";
import { Chip } from "../ui/chip";
import { cn } from "../ui/utils";

export interface CategoryChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string;
  /** Stored icon key from `finance.categories.icon` — resolved through the design-system
   * registry, never rendered from a raw component prop. */
  iconKey?: string | null;
  /** Stored color key from `finance.categories.color` — resolved through the design-system
   * registry, never a raw hex/class string. */
  colorKey?: string | null;
}

/**
 * Line icon inside a circular chip, per the proposal's iconography direction. The icon bubble
 * is ALWAYS rendered — an unknown/null key resolves to the neutral fallback rather than a
 * blank chip (design.md §3, change: finance-categories-icon-color, Decision 8).
 */
export const CategoryChip = React.forwardRef<HTMLSpanElement, CategoryChipProps>(
  ({ name, iconKey, colorKey, className, ...props }, ref) => {
    const Icon = resolveCategoryIcon(iconKey);
    const color = resolveCategoryColor(colorKey);
    return (
      <Chip ref={ref} className={cn(className)} {...props}>
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full",
            color.surface,
          )}
        >
          <Icon className={cn("h-3 w-3", color.text)} aria-hidden />
        </span>
        {name}
      </Chip>
    );
  },
);
CategoryChip.displayName = "CategoryChip";
