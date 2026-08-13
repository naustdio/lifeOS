import { BookOpen } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { FabMenu } from "@/design-system/patterns/FabMenu";
import { NavPill } from "@/design-system/ui/nav-pill";

/**
 * Recipes module's nested layout (change: recipes-module, spec `module-architecture`:
 * UI-Layer Route-Group Boundary — same shape `(health)/layout.tsx`/`(finance)/layout.tsx`
 * already established). `(recipes)` is a Next.js route group: zero URL segments added, so
 * `(recipes)/recetas/page.tsx` still serves `/recetas`. Sole owner of Recipes' bottom nav; the
 * outer `AppLayout` renders none of it. One tab only for this cycle — no overflow menu needed
 * yet (a future photo/video-focused view could add one).
 */
export default function RecipesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <NavPill>
        <Link
          href="/recetas"
          aria-label="Recetas"
          className="flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-200 ease-out hover:bg-nav-pill-foreground/10"
        >
          <BookOpen className="h-5 w-5" aria-hidden />
        </Link>
        <Link href="/recetas" aria-label="Nueva receta">
          <FabMenu label="Nueva receta" />
        </Link>
      </NavPill>
    </>
  );
}
