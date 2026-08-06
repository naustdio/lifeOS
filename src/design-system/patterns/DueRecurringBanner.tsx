import { Repeat } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Card, CardContent } from "../ui/card";
import { cn } from "../ui/utils";

export interface DueRecurringBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  count: number;
  href?: string;
}

/**
 * Home due-items banner (design.md §9, change: finance-recurring R-013). `Card`-based,
 * `forwardRef`/`cn` conventions matching `BalanceHero`. Renders only when `count > 0` — the
 * caller (`(app)/page.tsx`) is responsible for the conditional, but this component also guards
 * itself so it is never accidentally rendered empty.
 */
export const DueRecurringBanner = React.forwardRef<HTMLDivElement, DueRecurringBannerProps>(
  ({ count, href = "/recurrentes", className, ...props }, ref) => {
    if (count <= 0) return null;

    const copy = count === 1 ? "1 recurrente por confirmar" : `${count} recurrentes por confirmar`;

    return (
      <Link href={href} className="block">
        <Card ref={ref} className={cn("transition-colors duration-200 ease-out hover:bg-accent/60", className)} {...props}>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-secondary text-secondary-foreground">
              <Repeat className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-sm font-medium">{copy}</span>
          </CardContent>
        </Card>
      </Link>
    );
  },
);
DueRecurringBanner.displayName = "DueRecurringBanner";
