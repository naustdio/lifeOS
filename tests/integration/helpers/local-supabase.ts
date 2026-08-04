// Local-stack auth helper for T-032 facade contract tests (tasks.md T-032,
// finance-module-api spec). Establishes a REAL authenticated session against the local
// Supabase stack (`supabase start`), the same instance `supabase test db` runs pgTAP against.
//
// Why this exists instead of reusing `@/shared/supabase/server`'s `createClient()` directly:
// that function reads/writes auth cookies via `next/headers`, which only resolves inside an
// actual Next.js request scope (Server Component/Route Handler/Server Action). Outside that
// scope (a plain Vitest process) `cookies()` throws. The finance-facade integration test
// (`tests/integration/finance-facade.test.ts`) therefore mocks `@/shared/supabase/server` to
// return the client built here instead of a cookie-bound one — this substitutes ONLY the
// Next-specific cookie-transport plumbing (already covered by T-014/T-015's own auth-wiring
// code, not by this facade). Every RPC call the facade makes still goes out over real HTTP to
// the real local PostgREST/GoTrue/Postgres stack, under the real signed-in user's real JWT, and
// is subject to real RLS/SECURITY DEFINER checks — a genuine round trip, not a mock of the
// database or the seam.
//
// Keys below are the Supabase CLI's well-known LOCAL DEMO keys (`supabase status`), identical
// for every default local project and safe to commit — never used against a real project.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LOCAL_API_URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:55321";
const LOCAL_ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export type TestSession = { client: SupabaseClient; userId: string; email: string };

/** Admin (service-role) client — used only for fixture setup (creating test users). */
export function adminClient(): SupabaseClient {
  return createClient(LOCAL_API_URL, LOCAL_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Creates a brand-new confirmed user (local auth has `enable_confirmations = false`, so
 * password sign-in works immediately) and returns a real, signed-in client carrying that
 * user's real access token — the same shape of client `@supabase/ssr`'s `createServerClient`
 * would hand the facade in production, minus the cookie transport.
 */
export async function signUpAndSignIn(emailPrefix: string): Promise<TestSession> {
  const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "correct horse battery staple 1!";

  const admin = adminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`failed to create test user ${email}: ${createErr?.message}`);
  }

  const anon = createClient(LOCAL_API_URL, LOCAL_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signedIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr || !signedIn.session) {
    throw new Error(`failed to sign in test user ${email}: ${signInErr?.message}`);
  }

  return { client: anon, userId: created.user.id, email };
}
