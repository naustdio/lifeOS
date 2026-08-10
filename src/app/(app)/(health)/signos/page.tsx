import { getCurrentHouseholdId } from "@/modules/core/api";
import { listVitalReadings, toWireVisibility } from "@/modules/health/api";
import { createClient } from "@/shared/supabase/server";
import { VitalForm } from "./VitalForm";
import { VitalTrend } from "./VitalTrend";

/** Server container for the vitals screen (change: health-tracking) — never imports
 *  `finance/api` (spec `health-vitals` "Vital Metrics Never Create a Finance Transaction"). */
export default async function SignosPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);

  const readings = spaceId ? await listVitalReadings(supabase, spaceId) : [];
  const readingItems = readings.map((r) => ({ ...r, visibility: toWireVisibility(r.visibility) }));

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Signos vitales</h2>

      <VitalTrend readings={readingItems} />

      <VitalForm />
    </main>
  );
}
