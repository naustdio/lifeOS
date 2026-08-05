import Link from "next/link";
import { getCurrentHouseholdId } from "@/modules/core/api";
import { CategoryChip } from "@/design-system/patterns/CategoryChip";
import { MoneyAmount } from "@/design-system/patterns/MoneyAmount";
import { Card, CardContent } from "@/design-system/ui/card";
import {
  listActiveAccounts,
  listActiveCategories,
  listBudgetsWithProgress,
  listRecentTransactions,
} from "@/modules/finance/api";
import { formatCentsAsMXN } from "@/shared/money";
import { createClient } from "@/shared/supabase/server";
import { TransactionForm } from "./TransactionForm";

const TYPE_LABEL: Record<string, string> = {
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia",
};

/** Transaction entry (T-037) + recent history with an edit affordance
 * (T-038). Category picker only receives active categories — the repository
 * already excludes archived rows. */
export default async function MovementsPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);

  const [accounts, categories, transactions, budgets] = spaceId
    ? await Promise.all([
        listActiveAccounts(supabase, spaceId),
        listActiveCategories(supabase, spaceId),
        listRecentTransactions(supabase, spaceId),
        listBudgetsWithProgress(supabase, spaceId),
      ])
    : [[], [], [], []];

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Movimientos</h2>

      <Card>
        <CardContent className="pt-6">
          <TransactionForm
            accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
            budgets={budgets}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Recientes</h3>
        {transactions.length === 0 && (
          <p className="text-sm text-muted-foreground">Aún no hay movimientos registrados.</p>
        )}
        {transactions.map((tx) => (
          <Card key={tx.id} className={tx.status === "void" ? "opacity-50" : undefined}>
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{tx.accountName}</span>
                  {tx.categoryName && <CategoryChip name={tx.categoryName} />}
                </div>
                <p className="text-xs text-muted-foreground">
                  {TYPE_LABEL[tx.type]} · {tx.occurredOn}
                  {tx.status === "void" ? " · Anulado" : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <MoneyAmount
                  formatted={formatCentsAsMXN(tx.amountCents)}
                  kind={tx.amountCents >= 0 ? "income" : "expense"}
                />
                {tx.status === "posted" && (
                  <Link
                    href={`/movimientos/${tx.id}/editar`}
                    className="text-xs text-muted-foreground underline underline-offset-2"
                  >
                    Editar
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
