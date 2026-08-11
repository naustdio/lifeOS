"use client";

import { MoreVertical } from "lucide-react";
import * as React from "react";
import { cn } from "../ui/utils";

export interface RowActionMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export interface RowActionMenuProps {
  items: RowActionMenuItem[];
  /** aria-label for the trigger button. */
  label?: string;
}

/**
 * Anchored "..." action menu for a repeated list row (design-system convention: hand-rolled
 * disclosure, no new package, same closes-on-outside-click/Escape shape as `OverflowMenu` — but
 * anchored next to its own trigger instead of a full-screen centered sheet, since a list row
 * needs a lighter-weight menu than nav-level navigation).
 */
export function RowActionMenu({ items, label = "Más acciones" }: RowActionMenuProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-pill text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-card border border-input bg-card shadow-soft-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={cn(
                "block w-full px-3 py-2 text-left text-sm font-medium transition-colors duration-200 ease-out hover:bg-accent disabled:opacity-50",
                item.destructive ? "text-expense" : "text-card-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
