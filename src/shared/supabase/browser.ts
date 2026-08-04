import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-context Supabase client (design.md §6, T-014). Used only from
 * client components — e.g. the sign-in screen's `signInWithOAuth` call.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
