import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-context Supabase client (design.md §6, T-014). Reads/writes cookies
 * through `next/headers`. `setAll` is wrapped in try/catch because Server
 * Components cannot write cookies — the middleware's session refresh is what
 * actually persists a refreshed session in that case.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — no-op. The middleware's
            // session refresh handles cookie persistence in that path.
          }
        },
      },
    },
  );
}
