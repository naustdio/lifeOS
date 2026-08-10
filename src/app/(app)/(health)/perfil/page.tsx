import { getCurrentHouseholdId } from "@/modules/core/api";
import { listProfileFacts, toWireVisibility } from "@/modules/health/api";
import { createClient } from "@/shared/supabase/server";
import { ProfileCard } from "./ProfileCard";
import { ProfileForm } from "./ProfileForm";

/** Server container for the profile screen (change: health-tracking) — never imports
 *  `finance/api` (spec `health-profile` "Profile Facts Never Create a Finance Transaction"). */
export default async function PerfilPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);

  const facts = spaceId ? await listProfileFacts(supabase, spaceId) : [];
  const factItems = facts.map((f) => ({ ...f, visibility: toWireVisibility(f.visibility) }));

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Perfil de salud</h2>

      <ProfileCard facts={factItems} />

      <ProfileForm />
    </main>
  );
}
