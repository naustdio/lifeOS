import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware session refresh (design.md §6, T-014).
 *
 * KNOWN TRAP: constructing a fresh `NextResponse` without copying the
 * cookies that were just mutated silently logs users out — the single most
 * common `@supabase/ssr` mistake. `setAll` therefore writes to BOTH
 * `request.cookies` (so this same request sees the refreshed session) and
 * the `response` object that is actually returned to the browser, and every
 * `NextResponse.next({ request })` call after a cookie mutation is
 * reassigned to `response` so the caller returns the exact object whose
 * cookies were set — never a separately constructed one.
 *
 * Uses `getUser()` (validates against the Auth server), never `getSession()`,
 * because this result feeds an authorization decision (route protection) in
 * `src/middleware.ts`.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
