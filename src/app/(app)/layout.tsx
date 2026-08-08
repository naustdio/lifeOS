import Link from "next/link";
import { redirect } from "next/navigation";
import type * as React from "react";
import { ThemeToggle } from "@/design-system/ui/theme-toggle";
import { createClient } from "@/shared/supabase/server";

/**
 * Minimal authenticated shell (spec `identity/Household Terminology Hidden
 * From UI`, T-017; change app-module-hub, spec `module-hub`: Neutral Outer
 * Shell). Provides only the auth guard, the `max-w-md` container, and the
 * header — no module-specific nav lives here. Each module owns its own nav
 * inside its nested route-group layout (e.g. Finance's `(finance)/layout.tsx`).
 * The header title links back to `/`, the neutral module hub (spec:
 * Title Links Back to the Hub) — the only "back to hub" affordance.
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
        <Link href="/">
          <h1 className="text-xl font-semibold">LifeOS</h1>
        </Link>
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
