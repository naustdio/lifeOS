import { notFound } from "next/navigation";
import { getCurrentHouseholdId } from "@/modules/core/api";
import { createPhotoSignedUrl, getEventById, listVisitPhotos, listVitalReadings } from "@/modules/health/api";
import { createClient } from "@/shared/supabase/server";
import { VisitDetail } from "./VisitDetail";

/**
 * Server container for one nutrition visit's detail (nutrition-submodule) — signed photo URLs are
 * minted here only, server-side (design.md Data Flow — the bucket is never public).
 */
export default async function NutricionVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) notFound();

  const event = await getEventById(supabase, spaceId, id);
  if (!event || event.eventType !== "nutrition") notFound();

  const [readings, photos] = await Promise.all([
    listVitalReadings(supabase, spaceId, undefined, { eventId: id }),
    listVisitPhotos(supabase, id),
  ]);

  const photosWithUrls = await Promise.all(
    photos.map(async (photo) => ({
      id: photo.id,
      storagePath: photo.storagePath,
      signedUrl: await createPhotoSignedUrl(supabase, photo.storagePath, 300),
    })),
  );

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">{event.title}</h2>
      <p className="text-sm text-muted-foreground">
        {event.occurredOn}
        {event.providerName ? ` · ${event.providerName}` : ""}
      </p>

      <VisitDetail eventId={id} readings={readings} photos={photosWithUrls} />
    </main>
  );
}
