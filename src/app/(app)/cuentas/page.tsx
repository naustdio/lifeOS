import { Wallet } from "lucide-react";
import Link from "next/link";
import { getCurrentHouseholdId } from "@/modules/core/api";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { Chip } from "@/design-system/ui/chip";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { ProgressBar } from "@/design-system/patterns/ProgressBar";
import { TransactionRow } from "@/design-system/patterns/TransactionRow";
import { listActiveAccounts, listCreditCardStatus, type CreditCardStatusItem } from "@/modules/finance/api";
import { formatCentsAsMXN } from "@/shared/money";
import { createClient } from "@/shared/supabase/server";

/** "Vence en N días" / "Vencido hace N días" (design.md §4, CC-023). `null` propagates to no
 *  label at all — never a `NaN`/negative-looking string when the card has no due day. */
function dueDateLabel(daysUntilDue: number | null): string | null {
  if (daysUntilDue === null) return null;
  if (daysUntilDue < 0) return `Vencido hace ${Math.abs(daysUntilDue)} día${Math.abs(daysUntilDue) === 1 ? "" : "s"}`;
  if (daysUntilDue === 0) return "Vence hoy";
  return `Vence en ${daysUntilDue} día${daysUntilDue === 1 ? "" : "s"}`;
}

/** Visual-warning-only chip (spec: "Exceeding the Credit Limit Is a Visual Warning, Never a
 *  Block") — rendered beside the card row, never gates any write. */
function CardStatusBlock({ status }: { status: CreditCardStatusItem }) {
  if (!status.hasTerms) {
    return (
      <div className="px-2">
        <Link href="/cuentas/nueva" className="text-xs text-muted-foreground underline underline-offset-2">
          Sin términos configurados · Agregar
        </Link>
      </div>
    );
  }

  const due = dueDateLabel(status.daysUntilDue);

  return (
    <div className="flex flex-col gap-2 px-2">
      {due && <p className="text-xs text-muted-foreground">{due}</p>}
      {status.creditLimitCents !== null && (
        <ProgressBar valueCents={status.owedCents} limitCents={status.creditLimitCents} />
      )}
      {status.overLimit && (
        <Chip className="w-fit bg-expense/10 text-expense">Límite excedido</Chip>
      )}
    </div>
  );
}

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
 * Action calling `finance.api.createAccount()`. Finance UI polish: accounts
 * render via `TransactionRow`, goal/liability detail via `ProgressBar`, zero
 * accounts render `EmptyState`. */
export default async function AccountsPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  const [accounts, cardStatuses] = spaceId
    ? await Promise.all([listActiveAccounts(supabase, spaceId), listCreditCardStatus(supabase, spaceId)])
    : [[], []];
  const cardStatusByAccount = new Map(cardStatuses.map((s) => [s.accountId, s]));

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
                {account.type === "credit_card" &&
                  (cardStatusByAccount.get(account.id) ? (
                    <CardStatusBlock status={cardStatusByAccount.get(account.id)!} />
                  ) : (
                    <div className="px-2">
                      <Link href="/cuentas/nueva" className="text-xs text-muted-foreground underline underline-offset-2">
                        Sin términos configurados · Agregar
                      </Link>
                    </div>
                  ))}
                {account.goal && (
                  <div className="px-2">
                    <ProgressBar valueCents={account.balanceCents} limitCents={account.goal.targetAmountCents} />
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
