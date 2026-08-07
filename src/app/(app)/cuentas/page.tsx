import { Wallet } from "lucide-react";
import Link from "next/link";
import { getCurrentHouseholdId } from "@/modules/core/api";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { ProgressBar } from "@/design-system/patterns/ProgressBar";
import { TransactionRow } from "@/design-system/patterns/TransactionRow";
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
  investment: "Inversiones",
  loaned: "Prestado",
};

/** Minimal account list (T-036). Excludes archived accounts (`finance-
 * accounts/Account Archiving`). Reads go through `finance/data` repositories
 * directly under RLS — writes exist only via `/cuentas/nueva`'s Server
 * Action calling `finance.api.createAccount()`. Finance UI polish: accounts
 * render via `TransactionRow`, goal/liability detail via `ProgressBar`, zero
 * accounts render `EmptyState`. */
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

      {accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          heading="Todavía no tienes cuentas"
          description="Crea la primera para empezar a llevar tu balance."
          action={
            <Button asChild size="sm">
              <Link href="/cuentas/nueva">Nueva cuenta</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/60 py-2">
            {accounts.map((account) => (
              <div key={account.id} className="flex flex-col gap-2 py-1">
                <TransactionRow
                  title={account.name}
                  subtitle={TYPE_LABELS[account.type] ?? account.type}
                  formattedAmount={formatCentsAsMXN(account.balanceCents)}
                  kind={account.class === "asset" ? "income" : "expense"}
                />
                {account.liability && (
                  <div className="flex flex-col gap-1 px-2 text-xs text-muted-foreground">
                    <p>Tasa: {(account.liability.interestRateBp / 100).toFixed(2)}%</p>
                    <p>Plazo: {account.liability.termMonths} meses</p>
                    <p>Pago mensual: {formatCentsAsMXN(account.liability.monthlyPaymentCents)}</p>
                  </div>
                )}
                {account.goal && (
                  <div className="px-2">
                    <ProgressBar valueCents={account.balanceCents} limitCents={account.goal.targetAmountCents} />
                  </div>
                )}
                {account.investment && (
                  <div className="flex flex-col gap-1 px-2 text-xs text-muted-foreground">
                    {(() => {
                      const rendimientoCents =
                        account.investment.currentValueCents - account.balanceCents;
                      const sign = rendimientoCents > 0 ? "+" : rendimientoCents < 0 ? "" : "";
                      return (
                        <p>
                          Rendimiento: {sign}
                          {formatCentsAsMXN(rendimientoCents)}
                        </p>
                      );
                    })()}
                    <p>Valuado: {account.investment.valuedOn}</p>
                  </div>
                )}
                {account.loaned && (
                  <div className="flex flex-col gap-1 px-2 text-xs text-muted-foreground">
                    <p>Deudor: {account.loaned.counterpartyName}</p>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
