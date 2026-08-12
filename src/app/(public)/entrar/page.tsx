"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/design-system/ui/button";
import { createClient } from "@/shared/supabase/browser";
import { devSignIn } from "./dev-login-action";

const REASON_COPY: Record<string, string> = {
  bootstrap_failed: "No pudimos preparar tu espacio. Intenta de nuevo en unos segundos.",
  expired_or_used_code: "Ese enlace de acceso ya expiró. Intenta iniciar sesión de nuevo.",
  missing_verifier: "No pudimos verificar el inicio de sesión. Intenta de nuevo.",
  invalid_api_key: "Hay un problema de configuración. Contacta soporte.",
};
const DEFAULT_ERROR_COPY = "No pudimos iniciar sesión. Intenta de nuevo.";

/** Reads `?error=auth&reason=...` set by `src/app/auth/callback/route.ts` on a failed OAuth
 *  exchange or a failed `bootstrap_user()` call — split out so `useSearchParams` doesn't force
 *  the whole page out of static rendering (design.md §6). */
function SignInError() {
  const searchParams = useSearchParams();
  if (searchParams.get("error") !== "auth") return null;

  const reason = searchParams.get("reason");
  const message = (reason && REASON_COPY[reason]) || DEFAULT_ERROR_COPY;

  return <p className="text-sm text-expense">{message}</p>;
}

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
      <Suspense fallback={null}>
        <SignInError />
      </Suspense>
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
