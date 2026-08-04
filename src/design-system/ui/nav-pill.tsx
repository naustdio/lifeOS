import * as React from "react";
import { cn } from "./utils";

/**
 * Floating pill bottom nav shell (proposal design-direction table: "Floating
 * pill bottom nav with a central lime FAB"). This component renders the
 * pill container only; the central FAB slot is composed by
 * `patterns/FabMenu` (T-005).
 */
export const NavPill = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, children, ...props }, ref) => (
  <nav
    ref={ref}
    className={cn(
      "fixed inset-x-4 bottom-4 z-50 flex items-center justify-between rounded-pill bg-nav-pill px-4 py-2 text-nav-pill-foreground shadow-soft-lg",
      className,
    )}
    {...props}
  >
    {children}
  </nav>
));
NavPill.displayName = "NavPill";
