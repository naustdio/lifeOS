import { notFound } from "next/navigation";
import { getCurrentHouseholdId } from "@/modules/core/api";
import { listActiveAccounts, listActiveCategories, getTransactionById } from "@/modules/finance/api";
import { createClient } from "@/shared/supabase/server";
import { EditTransactionForm } from "./EditTransactionForm";

export default async function EditMovementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) notFound();

  const [transaction, accounts, categories] = await Promise.all([
    getTransactionById(supabase, spaceId, id),
    listActiveAccounts(supabase, spaceId),
    listActiveCategories(supabase, spaceId),
  ]);

  if (!transaction) notFound();

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Editar movimiento</h2>
      <EditTransactionForm
        transaction={transaction}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </main>
  );
}
