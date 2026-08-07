import { getCurrentHouseholdId } from "@/modules/core/api";
import { getHouseholdSummary, listActiveAccounts, listCreditCardStatus } from "@/modules/finance/api";
import { createClient } from "@/shared/supabase/server";
import { AccountsScreen } from "./AccountsScreen";

/** Server container for `/cuentas` (T-036, finance-account-types-expansion, Phase: tabbed
 *  account-type filter). Reads go through `finance/data` repositories directly under RLS —
 *  writes exist only via `/cuentas/nueva`'s Server Action calling `finance.api.createAccount()`.
 *  All rendering (tabs, hero, per-type detail blocks) lives in the client `AccountsScreen`. */
export default async function AccountsPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  const [accounts, cardStatuses, summary] = spaceId
    ? await Promise.all([
        listActiveAccounts(supabase, spaceId),
        listCreditCardStatus(supabase, spaceId),
        getHouseholdSummary(supabase, spaceId),
      ])
    : [[], [], { availableCents: 0, debtCents: 0 }];

  return <AccountsScreen accounts={accounts} cardStatuses={cardStatuses} availableCents={summary.availableCents} />;
}
