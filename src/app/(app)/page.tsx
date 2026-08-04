import { getCurrentProfile } from "@/modules/core/api";
import { BalanceHero } from "@/design-system/patterns/BalanceHero";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { createClient } from "@/shared/supabase/server";

/**
 * Home screen stub (T-017, T-039 lands the real `available_cents` figure in
 * 2C). Proves the auth flow works end to end: a signed-in user with a
 * bootstrapped personal space lands here directly, sees their own profile,
 * and can sign out — with zero "household" ceremony anywhere on screen.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  return (
    <main className="flex flex-col gap-6">
      <BalanceHero formatted="$0.00" />
      <Card>
        <CardHeader>
          <CardTitle>Tu cuenta</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {profile?.displayName ?? "Bienvenido"}
          </p>
          <form action="/auth/salir" method="post">
            <button
              type="submit"
              className="text-xs text-muted-foreground underline underline-offset-2"
            >
              Cerrar sesión
            </button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
