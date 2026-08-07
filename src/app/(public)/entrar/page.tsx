"use client";

import { Button } from "@/design-system/ui/button";
import { createClient } from "@/shared/supabase/browser";
import { devSignIn } from "./dev-login-action";

/**
 * Sign-in screen (design.md §6, spec `identity/Google OAuth Only`). Offers
 * exactly one sign-in option — no email/password, no other OAuth provider —
 * as the single big lime CTA the design-direction table calls for.
 */
export default function EntrarPage() {
  async function handleSignIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">LifeOS</h1>
        <p className="text-sm text-muted-foreground">
          Tu vida financiera y personal en un solo lugar.
        </p>
      </div>
      <Button size="lg" className="w-full" onClick={handleSignIn}>
        Iniciar sesión con Google
      </Button>
      {process.env.NODE_ENV !== "production" && (
        <form action={devSignIn}>
          <Button type="submit" size="sm" variant="ghost" className="w-full">
            Entrar como dev (solo local)
          </Button>
        </form>
      )}
    </main>
  );
}
