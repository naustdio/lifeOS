import { Receipt } from "lucide-react";
import Link from "next/link";
import { getCurrentHouseholdId } from "@/modules/core/api";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { TransactionRow } from "@/design-system/patterns/TransactionRow";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { resolveTransactionSubtypeIcon } from "@/design-system/tokens/transaction-subtype-style";
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
 * already excludes archived rows. Finance UI polish: recent transactions
 * render via `TransactionRow`, zero movements render `EmptyState`. */
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

      <Card id="top">
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
        {transactions.length === 0 ? (
          <EmptyState
            icon={Receipt}
            heading="Aún no hay movimientos"
            description="Registra tu primer ingreso o gasto arriba."
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="#top">Registrar movimiento</Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="divide-y divide-border/60 py-2">
              {transactions.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  icon={resolveTransactionSubtypeIcon(tx.subtype)}
                  title={tx.accountName}
                  subtitle={`${TYPE_LABEL[tx.type]}${tx.categoryName ? ` · ${tx.categoryName}` : ""} · ${tx.occurredOn}${tx.status === "void" ? " · Anulado" : ""}`}
                  formattedAmount={formatCentsAsMXN(tx.amountCents)}
                  kind={tx.amountCents >= 0 ? "income" : "expense"}
                  muted={tx.status === "void"}
                  trailing={
                    tx.status === "posted" ? (
                      <Link
                        href={`/movimientos/${tx.id}/editar`}
                        className="text-xs text-muted-foreground underline underline-offset-2"
                      >
                        Editar
                      </Link>
                    ) : undefined
                  }
                />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
