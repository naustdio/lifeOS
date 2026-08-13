import { getCurrentHouseholdId } from "@/modules/core/api";
import {
  getHouseholdSummary,
  listActiveAccounts,
  listArchivedAccounts,
  listCreditCardStatus,
} from "@/modules/finance/api";
import { createClient } from "@/shared/supabase/server";
import { AccountsScreen } from "./AccountsScreen";

/** Server container for `/cuentas` (T-036, finance-account-types-expansion, Phase: tabbed
 *  account-type filter). Reads go through `finance/data` repositories directly under RLS —
 *  writes exist only via `/cuentas/nueva`'s Server Action calling `finance.api.createAccount()`,
 *  plus the `/cuentas/[id]/editar` route's update/archive/delete seams (change:
 *  finance-account-edit). All rendering (tabs, hero, per-type detail blocks, the collapsed
 *  "Pausadas" section) lives in the client `AccountsScreen`. */
export default async function AccountsPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  const [accounts, archivedAccounts, cardStatuses, summary] = spaceId
    ? await Promise.all([
        listActiveAccounts(supabase, spaceId),
        listArchivedAccounts(supabase, spaceId),
        listCreditCardStatus(supabase, spaceId),
        getHouseholdSummary(supabase, spaceId),
      ])
    : [[], [], [], { availableCents: 0, debtCents: 0 }];

  return (
    <AccountsScreen
      accounts={accounts}
      archivedAccounts={archivedAccounts}
      cardStatuses={cardStatuses}
      availableCents={summary.availableCents}
    />
  );
}
