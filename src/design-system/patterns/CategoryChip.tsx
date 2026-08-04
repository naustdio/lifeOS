import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { Chip } from "../ui/chip";
import { cn } from "../ui/utils";

export interface CategoryChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string;
  icon?: LucideIcon;
}

/** Line icon inside a circular chip, per the proposal's iconography direction. */
export const CategoryChip = React.forwardRef<HTMLSpanElement, CategoryChipProps>(
  ({ name, icon: Icon, className, ...props }, ref) => (
    <Chip ref={ref} className={cn(className)} {...props}>
      {Icon ? (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background">
          <Icon className="h-3 w-3" aria-hidden />
        </span>
      ) : null}
      {name}
    </Chip>
  ),
);
CategoryChip.displayName = "CategoryChip";
