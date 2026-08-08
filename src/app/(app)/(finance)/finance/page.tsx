import { ArrowDownLeft, Plus, Receipt, Target, Wallet } from "lucide-react";
import Link from "next/link";
import { getCurrentHouseholdId, getCurrentProfile } from "@/modules/core/api";
import { BalanceHero } from "@/design-system/patterns/BalanceHero";
import { CategorySpendList } from "@/design-system/patterns/CategorySpendList";
import { DueRecurringBanner } from "@/design-system/patterns/DueRecurringBanner";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { MonthSummaryCard } from "@/design-system/patterns/MonthSummaryCard";
import { MoneyAmount } from "@/design-system/patterns/MoneyAmount";
import { ProgressBar } from "@/design-system/patterns/ProgressBar";
import { QuickActionRow } from "@/design-system/patterns/QuickActionRow";
import { TransactionRow } from "@/design-system/patterns/TransactionRow";
import { resolveTransactionSubtypeIcon } from "@/design-system/tokens/transaction-subtype-style";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-system/ui/card";
import {
  countDueRecurring,
  getHouseholdSummary,
  getMonthSummary,
  listActiveAccounts,
  listCategorySpend,
  listCreditCardStatus,
  listRecentTransactions,
} from "@/modules/finance/api";
import { formatCentsAsMXN } from "@/shared/money";
import { createClient } from "@/shared/supabase/server";

/** "Agosto 2026" style label — formatted here, never a Date crossing a component boundary
 *  (design.md §4.1). */
function currentMonthLabel(): string {
  const raw = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(new Date());
  return raw.replace(" de ", " ").replace(/^./, (c) => c.toUpperCase());
}

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

  const [summary, accounts, dueRecurringCount, monthSummary, categorySpend, recentTransactions, cardStatuses] =
    spaceId
      ? await Promise.all([
          getHouseholdSummary(supabase, spaceId),
          listActiveAccounts(supabase, spaceId),
          countDueRecurring(supabase, spaceId),
          getMonthSummary(supabase, spaceId),
          listCategorySpend(supabase, spaceId),
          listRecentTransactions(supabase, spaceId, 4, { postedOnly: true }),
          listCreditCardStatus(supabase, spaceId),
        ])
      : [{ availableCents: 0, debtCents: 0 }, [], 0, { incomeCents: 0, expenseCents: 0 }, [], [], []];

  const goalAccounts = accounts.filter((a) => a.goal);
  const monthLabel = currentMonthLabel();

  // "Por pagar pronto" (design.md §4, CC-024): cards due within the next week, visual signal
  // only — `available_cents` and the assets-only hero rule are untouched by this addition.
  const dueSoonCards = cardStatuses.filter(
    (c) => c.daysUntilDue !== null && c.daysUntilDue >= 0 && c.daysUntilDue <= 7,
  );
  const dueSoonCents = dueSoonCards.reduce((sum, c) => sum + c.owedCents, 0);
  const overdueCards = cardStatuses.filter((c) => c.daysUntilDue !== null && c.daysUntilDue < 0);
  const categorySpendItems = categorySpend.map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    spentCents: row.spentCents,
    formattedAmount: formatCentsAsMXN(row.spentCents),
  }));

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

      {dueSoonCards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Por pagar pronto</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <MoneyAmount formatted={formatCentsAsMXN(dueSoonCents)} kind="expense" />
            {overdueCards.length > 0 && (
              <p className="text-xs text-expense">
                {overdueCards.length} tarjeta{overdueCards.length === 1 ? "" : "s"} vencida
                {overdueCards.length === 1 ? "" : "s"}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <MonthSummaryCard
        monthLabel={monthLabel}
        incomeCents={monthSummary.incomeCents}
        expenseCents={monthSummary.expenseCents}
        formattedIncome={formatCentsAsMXN(monthSummary.incomeCents)}
        formattedExpense={formatCentsAsMXN(monthSummary.expenseCents)}
      />

      <CategorySpendList items={categorySpendItems} />

      {recentTransactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          heading="Sin movimientos recientes"
          description="Tus últimos movimientos aparecerán aquí."
        />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm text-muted-foreground">Movimientos recientes</CardTitle>
            <Link href="/movimientos" className="text-xs text-muted-foreground underline underline-offset-2">
              Ver todos
            </Link>
          </CardHeader>
          <CardContent className="divide-y divide-border/60 py-2">
            {recentTransactions.map((t) => (
              <TransactionRow
                key={t.id}
                icon={resolveTransactionSubtypeIcon(t.subtype)}
                title={t.description || t.categoryName || t.accountName}
                subtitle={`${t.type === "expense" ? "Gasto" : t.type === "income" ? "Ingreso" : "Transferencia"} · ${t.occurredOn}`}
                formattedAmount={formatCentsAsMXN(t.amountCents)}
                kind={t.amountCents >= 0 ? "income" : "expense"}
              />
            ))}
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
