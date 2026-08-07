"use server";

import { redirect } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/shared/supabase/server";

/**
 * DEV-ONLY sign-in shortcut. Skips the Google OAuth round trip against the local Supabase stack
 * so local testing doesn't require repeating the browser consent flow on every session/branch
 * switch. Signs in with a real password-auth session (cookies set for real, RLS applies exactly
 * as it would for a Google-authenticated user) — this is NOT a mock or a bypass of auth itself,
 * only of the Google provider specifically.
 *
 * Hard-gated to `NODE_ENV !== "production"`: Next.js statically replaces `process.env.NODE_ENV`
 * at build time, so a production build both never renders the button that calls this action AND
 * this function itself no-ops if somehow invoked. Uses the Supabase CLI's well-known local demo
 * service-role key (same fallback as tests/integration/helpers/local-supabase.ts) — safe only
 * because it is meaningless against any real, non-local project.
 */
export async function devSignIn() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("devSignIn is unavailable outside development");
  }

  const email = "dev@localhost.test";
  const password = "correct horse battery staple 1!";

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: existing } = await admin.auth.admin.listUsers();
  const alreadyExists = existing?.users.some((u) => u.email === email);
  if (!alreadyExists) {
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      throw new Error(`devSignIn: failed to create local dev user: ${createErr.message}`);
    }
  }

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    throw new Error(`devSignIn: sign-in failed: ${signInErr.message}`);
  }

  // Same bootstrap the real OAuth callback runs (src/app/auth/callback/route.ts) — ensures a
  // personal space exists for this user before landing on the app shell.
  await supabase.schema("app").rpc("bootstrap_user");

  redirect("/");
}
