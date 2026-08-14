"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/design-system/ui/utils";
import type { LucideIcon } from "lucide-react";

const TAB_SPRING = { type: "spring", stiffness: 210, damping: 18, mass: 1 } as const;

/**
 * Single filter tab that collapses to an icon-only pill when inactive and expands to icon+label
 * with a spring layout transition (plus a one-shot "shine" sweep) when selected — same visual
 * language as Finance's `/cuentas` type-tab bar (`AccountsScreen.tsx`'s `AccountTypeTab`), rebuilt
 * standalone here rather than imported/shared, since that file lives in the `finance` route and
 * design-system patterns may not depend on app-layer code. `aria-label` keeps the accessible name
 * stable even when the visible text is collapsed to width 0.
 */
export function AnimatedFilterTab({
  label,
  icon: Icon,
  isActive,
  onSelect,
}: {
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  onSelect: () => void;
}) {
  const [shine, setShine] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setShine(false);
      return;
    }
    const timer = setTimeout(() => setShine(true), 500);
    return () => clearTimeout(timer);
  }, [isActive]);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={label}
      onClick={onSelect}
      className="relative shrink-0 rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <motion.div layout="position" transition={TAB_SPRING} className="flex h-11 items-center justify-center">
        <div
          className={cn(
            "flex h-11 items-center justify-center overflow-hidden rounded-pill border transition-[width,gap,padding,background-color,color,border-color] duration-300 ease-out",
            isActive
              ? "w-auto gap-2 border-primary bg-primary px-4 text-primary-foreground"
              : "w-11 gap-0 border-border bg-card px-0 text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span
            className={cn(
              "relative overflow-hidden whitespace-nowrap text-sm font-medium transition-[max-width,opacity] duration-300 ease-out",
              isActive ? "max-w-40 opacity-100" : "max-w-0 opacity-0",
            )}
          >
            {label}
            <AnimatePresence>
              {isActive && shine && (
                <motion.span
                  aria-hidden
                  initial={{ left: "-120%" }}
                  animate={{ left: "120%" }}
                  transition={{ duration: 0.5, ease: "linear" }}
                  className="absolute top-0 bottom-0 w-10 bg-linear-to-r from-transparent via-primary-foreground/40 to-transparent"
                />
              )}
            </AnimatePresence>
          </span>
        </div>
      </motion.div>
    </button>
  );
}
