import { ArrowDownLeft, Plus, Target, Wallet } from "lucide-react";
import Link from "next/link";
import { getCurrentHouseholdId, getCurrentProfile } from "@/modules/core/api";
import { BalanceHero } from "@/design-system/patterns/BalanceHero";
import { DueRecurringBanner } from "@/design-system/patterns/DueRecurringBanner";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { MoneyAmount } from "@/design-system/patterns/MoneyAmount";
import { ProgressBar } from "@/design-system/patterns/ProgressBar";
import { QuickActionRow } from "@/design-system/patterns/QuickActionRow";
import { TransactionRow } from "@/design-system/patterns/TransactionRow";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import { countDueRecurring, getHouseholdSummary, listActiveAccounts } from "@/modules/finance/api";
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

const QUICK_ACTIONS = [
  { label: "Nueva transacción", icon: ArrowDownLeft, href: "/movimientos" },
  { label: "Nueva cuenta", icon: Plus, href: "/cuentas/nueva" },
  { label: "Presupuestos", icon: Target, href: "/presupuestos" },
];

/**
 * Home screen (T-039). `available_cents` is the hero figure — ASSETS ONLY
 * (`cash`/`checking`/`savings`/`savings_goal`); `debt_cents` is a separate
 * card and is NEVER subtracted from the hero (design.md §3.3). Zero
 * "household" ceremony anywhere on screen (T-017, unchanged from 1B).
 * Finance UI polish: `QuickActionRow` sits immediately below the hero, above
 * the debt card; accounts render via `TransactionRow`; zero accounts render
 * `EmptyState`.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const [profile, spaceId] = await Promise.all([getCurrentProfile(supabase), getCurrentHouseholdId(supabase)]);

  const [summary, accounts, dueRecurringCount] = spaceId
    ? await Promise.all([
        getHouseholdSummary(supabase, spaceId),
        listActiveAccounts(supabase, spaceId),
        countDueRecurring(supabase, spaceId),
      ])
    : [{ availableCents: 0, debtCents: 0 }, [], 0];

  const goalAccounts = accounts.filter((a) => a.goal);

  return (
    <main className="flex flex-col gap-6">
      <BalanceHero formatted={formatCentsAsMXN(summary.availableCents)} />
      <QuickActionRow actions={QUICK_ACTIONS} />

      {dueRecurringCount > 0 && <DueRecurringBanner count={dueRecurringCount} />}

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

      {accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          heading="Empieza por tu primera cuenta"
          description="Registra una cuenta para ver tu balance aquí."
          action={
            <Button asChild size="sm">
              <Link href="/cuentas/nueva">Nueva cuenta</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Tus cuentas</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/60 py-2">
            {accounts.map((account) => (
              <TransactionRow
                key={account.id}
                title={account.name}
                subtitle={TYPE_LABELS[account.type] ?? account.type}
                formattedAmount={formatCentsAsMXN(account.balanceCents)}
                kind={account.class === "asset" ? "income" : "expense"}
              />
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
            <ProgressBar valueCents={account.balanceCents} limitCents={account.goal!.targetAmountCents} />
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
