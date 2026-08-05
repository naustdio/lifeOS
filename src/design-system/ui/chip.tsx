import * as React from "react";
import { cn } from "./utils";

/**
 * Retokenized chip — full-pill radius, line-icon-in-circle friendly, used by
 * `CategoryChip` (design-system spec: "Base Component Set").
 */
export const Chip = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "inline-flex items-center gap-2 rounded-pill bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors duration-200 ease-out",
      className,
    )}
    {...props}
  />
));
Chip.displayName = "Chip";
