"use client";

import * as React from "react";
import { Wallet } from "lucide-react";
import Link from "next/link";
import { Button } from "@/design-system/ui/button";
import { Card, CardContent } from "@/design-system/ui/card";
import { Chip } from "@/design-system/ui/chip";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { ProgressBar } from "@/design-system/patterns/ProgressBar";
import { TransactionRow } from "@/design-system/patterns/TransactionRow";
import { cn } from "@/design-system/ui/utils";
import { formatCentsAsMXN } from "@/shared/money";

/** Structural subsets of `AccountListItem`/`CreditCardStatusItem` (design.md §-, this project's
 *  established convention: client components define local prop types rather than importing from
 *  the server-only-guarded finance barrel). */
type AccountType =
  | "cash" | "checking" | "savings" | "credit_card" | "liability" | "savings_goal" | "investment" | "loaned";

export type AccountItem = {
  id: string;
  name: string;
  type: AccountType;
  class: "asset" | "liability";
  balanceCents: number;
  liability?: { interestRateBp: number; termMonths: number; monthlyPaymentCents: number };
  goal?: { targetAmountCents: number };
  investment?: { currentValueCents: number; valuedOn: string };
  loaned?: { counterpartyName: string };
};

export type CardStatusItem = {
  accountId: string;
  hasTerms: boolean;
  owedCents: number;
  creditLimitCents: number | null;
  daysUntilDue: number | null;
  overLimit: boolean;
};

const TYPE_LABELS: Record<AccountType, string> = {
  cash: "Efectivo",
  checking: "Tarjeta de débito",
  savings: "Ahorros",
  credit_card: "Tarjeta de crédito",
  liability: "Préstamo / deuda",
  savings_goal: "Meta de ahorro",
  investment: "Inversiones",
  loaned: "Prestado",
};

type TabKey = "todo" | "debito" | "ahorros" | "inversiones" | "tarjetas" | "prestamos" | "prestado";

const TABS: {
  key: TabKey;
  label: string;
  types: AccountType[] | null;
  heroLabel: string;
  /** Type preselected on "Nueva cuenta" from this tab. `undefined` (the "Todo" tab, and any tab
   *  whose grouped types have no single obvious default) leaves the create form's own default. */
  defaultType?: AccountType;
}[] = [
  { key: "todo", label: "Todo", types: null, heroLabel: "Disponible" },
  { key: "debito", label: "Débito", types: ["cash", "checking"], heroLabel: "Débito", defaultType: "checking" },
  { key: "ahorros", label: "Ahorros", types: ["savings", "savings_goal"], heroLabel: "Ahorros", defaultType: "savings" },
  { key: "inversiones", label: "Inversiones", types: ["investment"], heroLabel: "Inversiones", defaultType: "investment" },
  { key: "tarjetas", label: "Tarjetas de crédito", types: ["credit_card"], heroLabel: "Saldo de crédito", defaultType: "credit_card" },
  { key: "prestamos", label: "Préstamos", types: ["liability"], heroLabel: "Total adeudado", defaultType: "liability" },
  { key: "prestado", label: "Prestado", types: ["loaned"], heroLabel: "Te deben", defaultType: "loaned" },
];

/** "Vence en N días" / "Vencido hace N días" — `null` propagates to no label. */
function dueDateLabel(daysUntilDue: number | null): string | null {
  if (daysUntilDue === null) return null;
  if (daysUntilDue < 0) return `Vencido hace ${Math.abs(daysUntilDue)} día${Math.abs(daysUntilDue) === 1 ? "" : "s"}`;
  if (daysUntilDue === 0) return "Vence hoy";
  return `Vence en ${daysUntilDue} día${daysUntilDue === 1 ? "" : "s"}`;
}

function CardStatusBlock({ status }: { status: CardStatusItem }) {
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
      {status.overLimit && <Chip className="w-fit bg-expense/10 text-expense">Límite excedido</Chip>}
    </div>
  );
}

function AccountCard({ account, cardStatus }: { account: AccountItem; cardStatus: CardStatusItem | undefined }) {
  return (
    <div className="flex flex-col gap-2 py-1">
      {/* Wrapped in the edit-route Link, not the whole card (change: finance-account-edit
          T5.1) — the card-terms block below renders its OWN nested `Link` to `/cuentas/nueva`
          when a credit_card account has no terms yet; nesting two <a> tags is invalid HTML, so
          only the row itself (name/type/balance) is the clickable target. */}
      <Link href={`/cuentas/${account.id}/editar`}>
        <TransactionRow
          title={account.name}
          subtitle={TYPE_LABELS[account.type] ?? account.type}
          formattedAmount={formatCentsAsMXN(account.balanceCents)}
          kind={account.class === "asset" ? "income" : "expense"}
        />
      </Link>
      {account.liability && (
        <div className="flex flex-col gap-1 px-2 text-xs text-muted-foreground">
          <p>Tasa: {(account.liability.interestRateBp / 100).toFixed(2)}%</p>
          <p>Plazo: {account.liability.termMonths} meses</p>
          <p>Pago mensual: {formatCentsAsMXN(account.liability.monthlyPaymentCents)}</p>
        </div>
      )}
      {account.type === "credit_card" &&
        (cardStatus ? (
          <CardStatusBlock status={cardStatus} />
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
      {account.investment && (
        <div className="flex flex-col gap-1 px-2 text-xs text-muted-foreground">
          <p>
            Rendimiento:{" "}
            {(() => {
              const rendimientoCents = account.investment.currentValueCents - account.balanceCents;
              const sign = rendimientoCents > 0 ? "+" : "";
              return `${sign}${formatCentsAsMXN(rendimientoCents)}`;
            })()}
          </p>
          <p>Valuado: {account.investment.valuedOn}</p>
        </div>
      )}
      {account.loaned && (
        <div className="flex flex-col gap-1 px-2 text-xs text-muted-foreground">
          <p>Deudor: {account.loaned.counterpartyName}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Collapsed-by-default "Pausadas" section (change: finance-account-edit T5.3, spec: "Pausadas
 * section is collapsed by default"). Only rendered on the "Todo" tab (design.md's own open-
 * question recommendation) to keep per-type hero totals unambiguous. Each row reuses
 * `AccountCard` (same Link-to-edit target — reactivating happens on the edit screen, not here)
 * so paused accounts get the exact same visual treatment as active ones, just segregated.
 */
function PausedAccountsSection({ accounts }: { accounts: AccountItem[] }) {
  const [expanded, setExpanded] = React.useState(false);
  if (accounts.length === 0) return null;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground"
      >
        <span>Pausadas ({accounts.length})</span>
        <span aria-hidden="true">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <CardContent className="divide-y divide-border/60 py-2">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} cardStatus={undefined} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Tabbed `/cuentas` screen: filters one account list by type group (Todo/Débito/Ahorros/
 * Inversiones/Tarjetas de crédito/Préstamos/Prestado) instead of showing every type mixed
 * together, with a hero total scoped to the active tab. `availableCents` (assets only, matching
 * the Home dashboard's own hero figure) anchors the "Todo" tab since summing every account's
 * signed balance would net assets against debts into a misleading single number.
 */
export function AccountsScreen({
  accounts,
  cardStatuses,
  availableCents,
  archivedAccounts = [],
}: {
  accounts: AccountItem[];
  cardStatuses: CardStatusItem[];
  availableCents: number;
  /** change: finance-account-edit T5.3 — paused accounts, shown in a collapsed section on the
   *  "Todo" tab only. Optional/defaulted so every pre-existing call site (and test) keeps
   *  compiling unchanged. */
  archivedAccounts?: AccountItem[];
}) {
  const [activeTab, setActiveTab] = React.useState<TabKey>("todo");
  const cardStatusByAccount = new Map(cardStatuses.map((s) => [s.accountId, s]));

  const activeTabDef = TABS.find((t) => t.key === activeTab) ?? TABS[0];
  const visibleAccounts = activeTabDef.types
    ? accounts.filter((a) => activeTabDef.types!.includes(a.type))
    : accounts;
  const newAccountHref = activeTabDef.defaultType
    ? `/cuentas/nueva?type=${activeTabDef.defaultType}`
    : "/cuentas/nueva";

  const heroCents =
    activeTab === "todo"
      ? availableCents
      : activeTab === "tarjetas"
        ? visibleAccounts.reduce((sum, a) => sum + (cardStatusByAccount.get(a.id)?.owedCents ?? 0), 0)
        : activeTab === "prestamos"
          ? visibleAccounts.reduce((sum, a) => sum + Math.abs(a.balanceCents), 0)
          : visibleAccounts.reduce((sum, a) => sum + a.balanceCents, 0);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cuentas</h2>
        <Button asChild size="sm">
          <Link href={newAccountHref}>Nueva cuenta</Link>
        </Button>
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-none"
        role="tablist"
        aria-label="Filtro por tipo de cuenta"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "shrink-0 rounded-pill border border-border px-3 py-1.5 text-sm font-medium transition-colors duration-200 ease-out",
              activeTab === tab.key
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{activeTabDef.heroLabel}</span>
        <span className="text-3xl font-semibold tabular-nums">{formatCentsAsMXN(heroCents)}</span>
      </div>

      {visibleAccounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          heading={activeTab === "todo" ? "Todavía no tienes cuentas" : "Nada por aquí todavía"}
          description={
            activeTab === "todo"
              ? "Crea la primera para empezar a llevar tu balance."
              : "Crea una cuenta de este tipo para empezar a llevarla aquí."
          }
          action={
            <Button asChild size="sm">
              <Link href={newAccountHref}>Nueva cuenta</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/60 py-2">
            {visibleAccounts.map((account) => (
              <AccountCard key={account.id} account={account} cardStatus={cardStatusByAccount.get(account.id)} />
            ))}
          </CardContent>
        </Card>
      )}

      {activeTab === "todo" && <PausedAccountsSection accounts={archivedAccounts} />}
    </main>
  );
}
