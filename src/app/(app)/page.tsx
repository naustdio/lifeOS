import { getCurrentHouseholdId, getCurrentProfile } from "@/modules/core/api";
import { BalanceHero } from "@/design-system/patterns/BalanceHero";
import { MoneyAmount } from "@/design-system/patterns/MoneyAmount";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { getHouseholdSummary, listActiveAccounts } from "@/modules/finance/api";
import { formatCentsAsMXN } from "@/shared/money";
import { createClient } from "@/shared/supabase/server";

const TYPE_LABELS: Record<string, string> = {
  cash: "Efectivo",
  checking: "Cuenta de cheques",
  savings: "Ahorros",
  credit_card: "Tarjeta de crédito",
  liability: "Préstamo / deuda",
  savings_goal: "Meta de ahorro",
};

/**
 * Home screen (T-039). `available_cents` is the hero figure — ASSETS ONLY
 * (`cash`/`checking`/`savings`/`savings_goal`); `debt_cents` is a separate
 * card and is NEVER subtracted from the hero (design.md §3.3). Zero
 * "household" ceremony anywhere on screen (T-017, unchanged from 1B).
 */
export default async function HomePage() {
  const supabase = await createClient();
  const [profile, spaceId] = await Promise.all([getCurrentProfile(supabase), getCurrentHouseholdId(supabase)]);

  const [summary, accounts] = spaceId
    ? await Promise.all([getHouseholdSummary(supabase, spaceId), listActiveAccounts(supabase, spaceId)])
    : [{ availableCents: 0, debtCents: 0 }, []];

  const goalAccounts = accounts.filter((a) => a.goal);

  return (
    <main className="flex flex-col gap-6">
      <BalanceHero formatted={formatCentsAsMXN(summary.availableCents)} />

      {summary.debtCents > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Deuda</CardTitle>
          </CardHeader>
          <CardContent>
            <MoneyAmount formatted={formatCentsAsMXN(summary.debtCents)} kind="expense" />
          </CardContent>
        </Card>
      )}

      {accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Tus cuentas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{account.name}</p>
                  <p className="text-xs text-muted-foreground">{TYPE_LABELS[account.type] ?? account.type}</p>
                </div>
                <MoneyAmount
                  formatted={formatCentsAsMXN(account.balanceCents)}
                  kind={account.class === "asset" ? "income" : "expense"}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {goalAccounts.map((account) => (
        <Card key={account.id}>
          <CardHeader>
            <CardTitle className="text-sm">{account.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {formatCentsAsMXN(account.balanceCents)} de {formatCentsAsMXN(account.goal!.targetAmountCents)} (
              {Math.min(100, Math.round((account.balanceCents / account.goal!.targetAmountCents) * 100))}%)
            </p>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Tu cuenta</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">{profile?.displayName ?? "Bienvenido"}</p>
          <form action="/auth/salir" method="post">
            <button type="submit" className="text-xs text-muted-foreground underline underline-offset-2">
              Cerrar sesión
            </button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
