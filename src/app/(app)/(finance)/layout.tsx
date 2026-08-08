import { CalendarDays, Home, Layers, Repeat, Target, Wallet } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { FabMenu } from "@/design-system/patterns/FabMenu";
import { OverflowMenu } from "@/design-system/patterns/OverflowMenu";
import { NavPill } from "@/design-system/ui/nav-pill";

/**
 * Finance module's nested layout (change: app-module-hub, spec
 * `module-architecture`: UI-Layer Route-Group Boundary). `(finance)` is a
 * Next.js route group — the parentheses add zero URL segments, so
 * `(finance)/movimientos/page.tsx` still serves `/movimientos`. This layout
 * is the sole owner of the Finance bottom nav (`NavPill`/`FabMenu`/
 * `OverflowMenu`); the outer `AppLayout` renders none of it.
 */
export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <NavPill>
        <Link
          href="/finance"
          aria-label="Inicio"
          className="flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-200 ease-out hover:bg-nav-pill-foreground/10"
        >
          <Home className="h-5 w-5" aria-hidden />
        </Link>
        <Link href="/movimientos" aria-label="Nuevo movimiento">
          <FabMenu />
        </Link>
        <Link
          href="/cuentas"
          aria-label="Cuentas"
          className="flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-200 ease-out hover:bg-nav-pill-foreground/10"
        >
          <Wallet className="h-5 w-5" aria-hidden />
        </Link>
        <OverflowMenu
          items={[
            {
              href: "/presupuestos",
              label: "Presupuestos",
              icon: <Target className="h-5 w-5" aria-hidden />,
            },
            {
              href: "/recurrentes",
              label: "Recurrentes",
              icon: <Repeat className="h-5 w-5" aria-hidden />,
            },
            {
              href: "/categorias",
              label: "Categorías",
              icon: <Layers className="h-5 w-5" aria-hidden />,
            },
            {
              href: "/calendario",
              label: "Calendario",
              icon: <CalendarDays className="h-5 w-5" aria-hidden />,
            },
          ]}
        />
      </NavPill>
    </>
  );
}
