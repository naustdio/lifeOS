import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { NavPill } from "@/design-system/ui/nav-pill";

/**
 * Shopping-list module's nested layout (tasks.md 3.1), mirroring `(recipes)/layout.tsx`'s shape
 * (module-architecture spec: UI-Layer Route-Group Boundary). `(shopping-list)` is a Next.js
 * route group: zero URL segments added, so `(shopping-list)/lista-de-compras/page.tsx` still
 * serves `/lista-de-compras`. Sole owner of this module's bottom nav; the outer `AppLayout`
 * renders none of it. No FAB — new items are added inline via `AddLooseItemForm`, unlike Recipes'
 * "Nueva receta" launcher.
 */
export default function ShoppingListLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <NavPill>
        <Link
          href="/lista-de-compras"
          aria-label="Lista de compras"
          className="flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-200 ease-out hover:bg-nav-pill-foreground/10"
        >
          <ShoppingCart className="h-5 w-5" aria-hidden />
        </Link>
      </NavPill>
    </>
  );
}
