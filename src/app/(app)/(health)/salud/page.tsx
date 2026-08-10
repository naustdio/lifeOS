import { getCurrentHouseholdId } from "@/modules/core/api";
import { listEvents, toWireVisibility } from "@/modules/health/api";
import { listActiveAccounts, listActiveCategories } from "@/modules/finance/api";
import { createClient } from "@/shared/supabase/server";
import { EventForm } from "./EventForm";
import { EventList } from "./EventList";

/**
 * Server container for the health events screen (design.md File Changes, change:
 * health-tracking) — mirrors `recurrentes/page.tsx`'s shape. `listActiveAccounts`/
 * `listActiveCategories("expense")` come from `finance/api` (composition at the `app` layer,
 * per Decision 5) purely to populate the cost fieldset's dropdowns — no write happens here.
 */
export default async function SaludPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);

  const [events, accounts, categories] = spaceId
    ? await Promise.all([
        listEvents(supabase, spaceId),
        listActiveAccounts(supabase, spaceId),
        listActiveCategories(supabase, spaceId, "expense"),
      ])
    : [[], [], []];

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  const eventItems = events.map((e) => ({ ...e, visibility: toWireVisibility(e.visibility) }));

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Salud</h2>

      <EventList events={eventItems} />

      <EventForm accounts={accountOptions} categories={categoryOptions} />
    </main>
  );
}
