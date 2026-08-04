import { Plus } from "lucide-react";
import * as React from "react";
import { cn } from "../ui/utils";

export interface FabMenuProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

/**
 * Central lime FAB for quick expense/income entry — "the most repeated
 * action gets the best real estate" (proposal design-direction table).
 * Composed inside `NavPill` by the authenticated shell layout (sub-slice
 * 1B/2C); sub-slice 1A ships the component itself.
 */
export const FabMenu = React.forwardRef<HTMLButtonElement, FabMenuProps>(
  ({ label = "Agregar movimiento", className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        "flex h-16 w-16 items-center justify-center rounded-pill bg-primary text-primary-foreground shadow-soft-lg transition-transform hover:scale-105",
        className,
      )}
      {...props}
    >
      <Plus className="h-7 w-7" aria-hidden />
    </button>
  ),
);
FabMenu.displayName = "FabMenu";
