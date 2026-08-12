import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/shared/supabase/server";

const ERROR_CATEGORIES = [
  ["code verifier not found", "missing_verifier"],
  ["flow state already used", "expired_or_used_code"],
  ["flow state expired", "expired_or_used_code"],
  ["invalid api key", "invalid_api_key"],
] as const;

function classifyExchangeError(error: unknown) {
  const errorRecord = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : null;
  const message = typeof errorRecord?.message === "string" ? errorRecord.message.toLowerCase() : "";

  for (const [substring, category] of ERROR_CATEGORIES) {
    if (message.includes(substring)) {
      return category;
    }
  }

  return "unknown";
}

function safeConfigurationFingerprint() {
  let supabaseUrlHost = "unknown";
  try {
    supabaseUrlHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname || "unknown";
  } catch {
    // Invalid or absent configuration must not expose the configured URL.
  }

  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return {
    supabaseUrlHost,
    supabasePublishableKeySha256Prefix: key
      ? createHash("sha256").update(key).digest("hex").slice(0, 12)
      : "unknown",
  };
}

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
      const { error: bootstrapError } = await supabase.schema("app").rpc("bootstrap_user");
      if (bootstrapError) {
        // A silently-ignored failure here leaves the user signed in with no personal space —
        // every later action then fails with the unrelated-looking "No tienes acceso a este
        // espacio.", with no trace of why. Log it and stop before landing on `next`.
        console.error("bootstrap_user_failed", {
          message: bootstrapError.message,
          code: bootstrapError.code,
          ...safeConfigurationFingerprint(),
        });
        return NextResponse.redirect(`${origin}/entrar?error=auth&reason=bootstrap_failed`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }

    const category = classifyExchangeError(error);
    console.error("oauth_code_exchange_failed", {
      category,
      ...safeConfigurationFingerprint(),
    });
    return NextResponse.redirect(`${origin}/entrar?error=auth&reason=${category}`);
  }

  return NextResponse.redirect(`${origin}/entrar?error=auth`);
}
