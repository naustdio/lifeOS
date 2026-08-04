import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Shared class-name merge helper used by every retokenized primitive. Lives
 * in `design-system/ui/` because `design-system/` may not import from
 * `modules/` (design.md §1) but is free to own its own small utilities.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
