import { getCurrentHouseholdId } from "@/modules/core/api";
import { listEvents, listVitalReadings, listVisitPhotos, toWireVisibility } from "@/modules/health/api";
import { listActiveAccounts, listActiveCategories } from "@/modules/finance/api";
import { createClient } from "@/shared/supabase/server";
import { VisitForm } from "./VisitForm";
import { VisitList, type NutritionVisitListItem } from "./VisitList";

/**
 * Server container for the nutrition visits screen (nutrition-submodule) — mirrors `salud/page.tsx`'s
 * shape. A "visit" is a nutrition-type `health.events` row; metric/photo counts come from the
 * linked `vital_readings`/`nutrition_visit_photos` (design.md Approach — the event row IS the
 * visit). Legacy nutrition events (created via `/salud` before this shipped) have 0 linked rows
 * and still render as completable visits (spec `health-nutrition-visits`).
 */
export default async function NutricionPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);

  const [events, accounts, categories] = spaceId
    ? await Promise.all([
        listEvents(supabase, spaceId),
        listActiveAccounts(supabase, spaceId),
        listActiveCategories(supabase, spaceId, "expense"),
      ])
    : [[], [], []];

  const nutritionEvents = events.filter((e) => e.eventType === "nutrition");

  const visits: NutritionVisitListItem[] = await Promise.all(
    nutritionEvents.map(async (event) => {
      const [readings, photos] = spaceId
        ? await Promise.all([
            listVitalReadings(supabase, spaceId, undefined, { eventId: event.id }),
            listVisitPhotos(supabase, event.id),
          ])
        : [[], []];
      return {
        id: event.id,
        title: event.title,
        occurredOn: event.occurredOn,
        providerName: event.providerName,
        visibility: toWireVisibility(event.visibility),
        amountCents: event.amountCents,
        metricCount: readings.length,
        photoCount: photos.length,
      };
    }),
  );

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Nutrición</h2>

      <VisitList visits={visits} />

      <VisitForm accounts={accountOptions} categories={categoryOptions} />
    </main>
  );
}
