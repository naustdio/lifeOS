import * as React from "react";
import { cn } from "./utils";

/**
 * Retokenized shadcn Input — form-input primitive from the base component
 * set (design-system spec: "Base Component Set").
 */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, onFocus, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    onFocus={(event) => {
      // Every money/quantity field in the app defaults to "0" (design.md convention: no
      // separate money-input primitive) — without this, typing after focusing appends onto
      // that "0" (e.g. "0258") instead of replacing it, since a number input only restricts
      // characters, not cursor placement.
      if (type === "number") event.currentTarget.select();
      onFocus?.(event);
    }}
    className={cn(
      "flex h-11 w-full rounded-card border border-input bg-surface px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
