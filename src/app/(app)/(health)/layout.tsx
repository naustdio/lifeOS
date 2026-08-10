import { HeartPulse, LineChart, UserRound } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { FabMenu } from "@/design-system/patterns/FabMenu";
import { NavPill } from "@/design-system/ui/nav-pill";

/**
 * Health module's nested layout (change: health-tracking, spec `module-architecture`:
 * UI-Layer Route-Group Boundary — same shape `(finance)/layout.tsx` already established).
 * `(health)` is a Next.js route group: zero URL segments added, so `(health)/salud/page.tsx`
 * still serves `/salud`. Sole owner of Health's bottom nav; the outer `AppLayout` renders none
 * of it. Three tabs only (no overflow menu — Health's screen count doesn't need one yet).
 */
export default function HealthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <NavPill>
        <Link
          href="/salud"
          aria-label="Eventos"
          className="flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-200 ease-out hover:bg-nav-pill-foreground/10"
        >
          <HeartPulse className="h-5 w-5" aria-hidden />
        </Link>
        <Link href="/salud" aria-label="Nuevo evento">
          <FabMenu label="Nuevo evento" />
        </Link>
        <Link
          href="/signos"
          aria-label="Signos vitales"
          className="flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-200 ease-out hover:bg-nav-pill-foreground/10"
        >
          <LineChart className="h-5 w-5" aria-hidden />
        </Link>
        <Link
          href="/perfil"
          aria-label="Perfil"
          className="flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-200 ease-out hover:bg-nav-pill-foreground/10"
        >
          <UserRound className="h-5 w-5" aria-hidden />
        </Link>
      </NavPill>
    </>
  );
}
