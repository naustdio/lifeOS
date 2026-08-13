import { notFound } from "next/navigation";
import { getCurrentHouseholdId } from "@/modules/core/api";
import { getAccountById } from "@/modules/finance/api";
import { createClient } from "@/shared/supabase/server";
import { EditAccountForm } from "./EditAccountForm";

/**
 * Server component for `/cuentas/[id]/editar` (change: finance-account-edit T4.1). Mirrors
 * `movimientos/[id]/editar/page.tsx`'s exact shape: load by id, `notFound()` on missing or
 * out-of-household id. `getAccountById` deliberately returns paused accounts too (design.md
 * Decision, T2.1) so a paused account can still be opened and reactivated.
 */
export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) notFound();

  const account = await getAccountById(supabase, spaceId, id);
  if (!account) notFound();

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Editar cuenta</h2>
      <EditAccountForm account={account} />
    </main>
  );
}
