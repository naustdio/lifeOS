import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "../domain/profile";

/**
 * Row <-> entity mapper + repository for `core.profiles`. Client-direct
 * reads under RLS remain fine for this shape (design.md's approach) — the
 * caller supplies whichever Supabase client fits its execution context
 * (server component vs. client component).
 */
export async function getCurrentProfile(
  supabase: SupabaseClient,
): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .schema("core")
    .from("profiles")
    .select("user_id, display_name, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    userId: data.user_id,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
  };
}
