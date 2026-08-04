import Link from "next/link";
import { getCurrentHouseholdId } from "@/modules/core/api";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { MoneyAmount } from "@/design-system/patterns/MoneyAmount";
import { listActiveAccounts } from "@/modules/finance/api";
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

/** Minimal account list (T-036). Excludes archived accounts (`finance-
 * accounts/Account Archiving`). Reads go through `finance/data` repositories
 * directly under RLS — writes exist only via `/cuentas/nueva`'s Server
 * Action calling `finance.api.createAccount()`. */
export default async function AccountsPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  const accounts = spaceId ? await listActiveAccounts(supabase, spaceId) : [];

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cuentas</h2>
        <Button asChild size="sm">
          <Link href="/cuentas/nueva">Nueva cuenta</Link>
        </Button>
      </div>

      {accounts.length === 0 && (
        <p className="text-sm text-muted-foreground">Todavía no tienes cuentas. Crea la primera.</p>
      )}

      <div className="flex flex-col gap-3">
        {accounts.map((account) => (
          <Card key={account.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{account.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{TYPE_LABELS[account.type] ?? account.type}</p>
              </div>
              <MoneyAmount
                formatted={formatCentsAsMXN(account.balanceCents)}
                kind={account.class === "asset" ? "income" : "expense"}
              />
            </CardHeader>
            {account.liability && (
              <CardContent className="flex flex-col gap-1 text-xs text-muted-foreground">
                <p>Tasa: {(account.liability.interestRateBp / 100).toFixed(2)}%</p>
                <p>Plazo: {account.liability.termMonths} meses</p>
                <p>Pago mensual: {formatCentsAsMXN(account.liability.monthlyPaymentCents)}</p>
              </CardContent>
            )}
            {account.goal && (
              <CardContent className="flex flex-col gap-1 text-xs text-muted-foreground">
                <p>
                  Progreso: {formatCentsAsMXN(account.balanceCents)} de{" "}
                  {formatCentsAsMXN(account.goal.targetAmountCents)} (
                  {Math.min(100, Math.round((account.balanceCents / account.goal.targetAmountCents) * 100))}%)
                </p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </main>
  );
}
