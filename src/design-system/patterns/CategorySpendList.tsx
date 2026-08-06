import { PieChart } from "lucide-react";
import * as React from "react";
import { EmptyState } from "./EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../ui/utils";

export interface CategorySpendListItem {
  categoryId: string;
  categoryName: string;
  spentCents: number;
  /** Pre-formatted es-MX MXN. */
  formattedAmount: string;
}

export interface CategorySpendListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Caller supplies them already ranked highest-first (the view + `.order()` do it). */
  items: CategorySpendListItem[];
}

/**
 * Six already-approved token classes with opacity modifiers — no new token, no hex
 * (`check-tokens.mjs` gate). `income`/`expense` tokens are deliberately excluded: they carry
 * app-wide money-direction meaning, and every row here is already an expense.
 */
export const CATEGORY_BAR_CLASSES = [
  "bg-primary",
  "bg-accent-brand",
  "bg-primary/70",
  "bg-accent-brand/70",
  "bg-primary/45",
  "bg-accent-brand/45",
] as const;

/**
 * Stable per-category color: an FNV-1a-style hash of the category UUID, NOT the render
 * index (design.md §4.2, change: finance-dashboard-feed F-008). Index-keyed rotation would
 * recolor a category the moment its rank changed; the spec requires the same category to
 * render the same color across reloads. Pure and exported for unit test.
 */
export function categoryBarClass(categoryId: string): string {
  let h = 2166136261;
  for (let i = 0; i < categoryId.length; i++) {
    h ^= categoryId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return CATEGORY_BAR_CLASSES[Math.abs(h) % CATEGORY_BAR_CLASSES.length];
}

/**
 * Bar-percentage rule, extracted for unit test (design.md §4.2). Mirrors `ProgressBar`'s
 * `limitCents > 0 ? … : 0` divide-by-zero guard. `Math.max(2, …)` keeps a tiny category
 * visible as a sliver rather than a zero-width bar that reads as broken.
 */
export function categoryBarPercent(spentCents: number, maxCents: number): number {
  return maxCents > 0 ? Math.max(2, Math.round((spentCents / maxCents) * 100)) : 0;
}

/**
 * Home's spending-by-category card (design.md §4.2, change: finance-dashboard-feed F-008).
 * Extends `ProgressBar`'s track/fill technique (copied verbatim, not imported — `ProgressBar`
 * hardcodes `bg-primary`/`bg-expense` and a `value / limit` label, neither of which fits this
 * list) with per-category color and a name+amount row. `aria-hidden` on the track, and
 * deliberately no `role="progressbar"`: these bars encode relative magnitude, not progress
 * toward a limit, and the category name + formatted amount already give a screen reader the
 * full information.
 */
export const CategorySpendList = React.forwardRef<HTMLDivElement, CategorySpendListProps>(
  ({ items, className, ...props }, ref) => {
    if (items.length === 0) {
      return (
        <EmptyState
          ref={ref}
          className={className}
          icon={PieChart}
          heading="Sin gastos por categoría"
          description="Cuando registres gastos verás aquí en qué se te va el dinero."
          {...props}
        />
      );
    }

    const maxCents = items[0]?.spentCents ?? 0;

    return (
      <Card ref={ref} className={cn(className)} {...props}>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Gastos por categoría</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {items.map((item) => {
            const pct = categoryBarPercent(item.spentCents, maxCents);
            const barClass = categoryBarClass(item.categoryId);

            return (
              <div key={item.categoryId} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{item.categoryName}</span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {item.formattedAmount}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-pill bg-secondary" aria-hidden>
                  <div
                    className={cn("h-full rounded-pill transition-[width] duration-200 ease-out", barClass)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  },
);
CategorySpendList.displayName = "CategorySpendList";
