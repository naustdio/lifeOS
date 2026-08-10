import type { SupabaseClient } from "@supabase/supabase-js";
import type { FactType, Severity } from "../domain/profile";
import type { Visibility } from "../domain/event";

/**
 * Repository for `health.profile_facts` (design.md Schema, migration
 * `20260804090033_health_schema.sql` / `20260804090034_health_security.sql`). Plain RLS-guarded
 * CRUD, same shape as `event-repository.ts`. Spec `health-profile` "Profile Facts Never Create a
 * Finance Transaction" — no path to `finance/api`, structurally.
 */
export type ProfileFactListItem = {
  id: string;
  householdId: string;
  ownerUserId: string;
  factType: FactType;
  label: string;
  detail: string;
  severity: Severity | null;
  active: boolean;
  visibility: Visibility;
};

function mapProfileFactRow(r: Record<string, unknown>): ProfileFactListItem {
  return {
    id: r.id as string,
    householdId: r.household_id as string,
    ownerUserId: r.owner_user_id as string,
    factType: r.fact_type as FactType,
    label: r.label as string,
    detail: (r.detail as string) ?? "",
    severity: (r.severity as Severity | null) ?? null,
    active: r.active as boolean,
    visibility: r.visibility as Visibility,
  };
}

const PROFILE_COLUMNS = "id, household_id, owner_user_id, fact_type, label, detail, severity, active, visibility";

/** Profile facts for the space. `activeOnly` (default true) matches spec `health-profile`
 *  "Profile Reflects Current State" — the profile screen shows the current set, not history;
 *  pass `activeOnly: false` for an edit/management view that also lists removed facts. */
export async function listProfileFacts(
  supabase: SupabaseClient,
  householdId: string,
  options: { activeOnly?: boolean } = {},
): Promise<ProfileFactListItem[]> {
  let query = supabase.schema("health").from("profile_facts").select(PROFILE_COLUMNS).eq("household_id", householdId);

  if (options.activeOnly ?? true) {
    query = query.eq("active", true);
  }

  const { data, error } = await query.order("fact_type", { ascending: true }).order("label", { ascending: true });
  if (error || !data) {
    return [];
  }

  return data.map(mapProfileFactRow);
}

/** RLS-guarded insert. Never posts a `finance.transactions` row (spec `health-profile`). */
export async function createProfileFact(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    ownerUserId: string;
    factType: FactType;
    label: string;
    detail?: string;
    severity?: Severity | null;
    visibility?: Visibility;
  },
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .schema("health")
    .from("profile_facts")
    .insert({
      household_id: input.householdId,
      owner_user_id: input.ownerUserId,
      fact_type: input.factType,
      label: input.label,
      detail: input.detail ?? "",
      severity: input.severity ?? null,
      active: true,
      visibility: input.visibility ?? "household",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { id: null, error: error?.message ?? "insert failed" };
  }

  return { id: data.id as string, error: null };
}

/** RLS-guarded update. "Removing" a fact is `active: false` (spec `health-profile`: "adding and
 *  later removed one allergy" — a state transition, not a delete), so history/audit is
 *  preservable; `deleteProfileFact` below remains available for a genuine correction. */
export async function updateProfileFact(
  supabase: SupabaseClient,
  householdId: string,
  id: string,
  patch: { label?: string; detail?: string; severity?: Severity | null; active?: boolean; visibility?: Visibility },
): Promise<{ error: string | null }> {
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.detail !== undefined) update.detail = patch.detail;
  if (patch.severity !== undefined) update.severity = patch.severity;
  if (patch.active !== undefined) update.active = patch.active;
  if (patch.visibility !== undefined) update.visibility = patch.visibility;

  const { error } = await supabase.schema("health").from("profile_facts").update(update).eq("id", id).eq("household_id", householdId);

  return { error: error?.message ?? null };
}

/** RLS-guarded hard delete — a genuine correction (e.g. a mis-entered fact), distinct from the
 *  ordinary `active: false` removal path above. */
export async function deleteProfileFact(supabase: SupabaseClient, householdId: string, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.schema("health").from("profile_facts").delete().eq("id", id).eq("household_id", householdId);

  return { error: error?.message ?? null };
}
