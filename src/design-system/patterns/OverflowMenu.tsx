"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Card, CardContent } from "../ui/card";
import { cn } from "../ui/utils";

export type OverflowMenuItem = {
  href: string;
  label: string;
  /** A rendered icon element (e.g. `<Target className="h-5 w-5" aria-hidden />`), NOT a
   * component reference — a Lucide component/function crossing the Server-to-Client boundary
   * from `(app)/layout.tsx` fails RSC serialization ("Only plain objects can be passed...").
   * React elements are serializable across that boundary; bare component functions are not. */
  icon: React.ReactNode;
};

export interface OverflowMenuProps {
  items: OverflowMenuItem[];
}

/**
 * "Más" nav-pill overflow entry point (design.md §9, change: finance-recurring R-014). Renders
 * its own trigger — a `<button aria-label="Más" aria-expanded>` styled with the EXACT SAME class
 * string as the sibling direct nav links, so the pill's geometry is unchanged. Hand-rolled
 * disclosure sheet (no new package, no Radix DropdownMenu, per the proposal): closes on backdrop
 * click, `Escape`, and route change. Reuses `OverBudgetDialog`'s overlay markup shape.
 */
export function OverflowMenu({ items }: OverflowMenuProps) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Más"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-200 ease-out hover:bg-nav-pill-foreground/10"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <Card className={cn("w-full max-w-sm")} onClick={(event) => event.stopPropagation()}>
            <CardContent className="flex flex-col gap-1 pt-6">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-card px-3 py-3 text-sm font-medium transition-colors duration-200 ease-out hover:bg-accent"
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
