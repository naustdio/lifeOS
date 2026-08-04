import { NextResponse } from "next/server";
import { createClient } from "@/shared/supabase/server";

/**
 * PKCE code exchange + first-sign-in bootstrap (design.md §6 sequence
 * diagram, T-015). `app.bootstrap_user()` is one Postgres transaction — this
 * slice's version calls only `core.ensure_personal_space()` (design.md §6.1;
 * the Finance step is added later via `CREATE OR REPLACE` in slice 2A, not
 * implemented here). Zero setup ceremony: no space-naming prompt, straight
 * redirect to `next`.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // `app` is the DB-layer composition root (design.md §6.1) — the only
      // schema allowed to call into more than one module.
      await supabase.schema("app").rpc("bootstrap_user");
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/entrar?error=auth`);
}
