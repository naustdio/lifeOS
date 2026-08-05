import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { Card, CardContent } from "../ui/card";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  heading: string;
  /** One muted supporting line. */
  description?: string;
  /** Primary or ghost CTA, e.g. `<Button asChild><Link href="/cuentas/nueva">…</Link></Button>`. */
  action?: React.ReactNode;
}

/**
 * Shared, illustration-free empty-state shape (design.md — Empty States):
 * icon + heading + one muted line + one CTA. Used for zero accounts, zero
 * movements, and zero expense categories.
 */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon: Icon, heading, description, action, className, ...props }, ref) => (
    <Card ref={ref} className={className} {...props}>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-secondary text-secondary-foreground">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <h3 className="text-sm font-medium">{heading}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        {action}
      </CardContent>
    </Card>
  ),
);
EmptyState.displayName = "EmptyState";
