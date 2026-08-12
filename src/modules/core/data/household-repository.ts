import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves the current user's personal space id (T-036/T-037/T-039, sub-slice
 * 2C). `core` owns tenancy resolution — this is the read the Finance seam's
 * every input (`householdId`) ultimately needs, so it lives here rather than
 * being duplicated per calling module. Client-direct read under RLS remains
 * fine for this shape (design.md's approach); `core.household_members`
 * grants SELECT to a member of the row's own space.
 */
export async function getCurrentHouseholdId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Temporary diagnostic (see finance-subscriptions session incident, 2026-08-12): every
    // caller collapses this into the same "No tienes acceso a este espacio." copy, so without
    // this the two genuinely different failure modes (no session vs. no membership row) were
    // indistinguishable from Vercel logs alone.
    console.error("getCurrentHouseholdId: auth.getUser() returned no user");
    return null;
  }

  const { data, error } = await supabase
    .schema("core")
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.error("getCurrentHouseholdId: no household_members row for authenticated user", {
      userId: user.id,
      errorMessage: error?.message,
      errorCode: error?.code,
    });
    return null;
  }

  return data.household_id as string;
}
