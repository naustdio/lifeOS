import Link from "next/link";
import { redirect } from "next/navigation";
import type * as React from "react";
import { FabMenu } from "@/design-system/patterns/FabMenu";
import { NavPill } from "@/design-system/ui/nav-pill";
import { ThemeToggle } from "@/design-system/ui/theme-toggle";
import { createClient } from "@/shared/supabase/server";

/**
 * Minimal authenticated shell (spec `identity/Household Terminology Hidden
 * From UI`, T-017): the floating pill bottom nav with the central lime FAB,
 * and NOTHING that names or lets the user pick a "household"/"hogar" — no
 * space-selection control exists anywhere in this tree.
 *
 * `src/middleware.ts` already redirects unauthenticated requests to
 * `/entrar` before they reach this layout; the check here is defense in
 * depth, not the primary guard.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/entrar");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 pb-28 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">LifeOS</h1>
        <ThemeToggle />
      </div>
      {children}
      <NavPill>
        <Link href="/" className="text-sm">
          Inicio
        </Link>
        <Link href="/movimientos">
          <FabMenu />
        </Link>
        <Link href="/cuentas" className="text-sm">
          Cuentas
        </Link>
        <Link href="/presupuestos" className="text-sm">
          Presupuestos
        </Link>
      </NavPill>
    </div>
  );
}
