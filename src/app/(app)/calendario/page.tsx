import { getCurrentHouseholdId } from "@/modules/core/api";
import { buildMonthCells, getHouseholdSummary, listRecurringDefinitions, projectBalance } from "@/modules/finance/api";
import { createClient } from "@/shared/supabase/server";
import { formatCentsAsMXN } from "@/shared/money";
import { CalendarScreen } from "./CalendarScreen";

/** Every month touched by `[fromDate, toDate]`, ascending — bounds `CalendarScreen`'s month
 *  navigation to exactly the horizon (design.md §3, K-014). */
function monthsBetween(fromDate: string, toDate: string): string[] {
  const [fromYear, fromMonth] = fromDate.split("-").map(Number);
  const [toYear, toMonth] = toDate.split("-").map(Number);
  const months: string[] = [];
  let year = fromYear;
  let month = fromMonth;
  while (year < toYear || (year === toYear && month <= toMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/**
 * Server container for `/calendario` (design.md §3/§4, change: finance-calendar-projection
 * K-014). Two UNCHANGED repository reads feed the pure `projectBalance()` fold — `fromDate` is
 * computed SERVER-SIDE (design.md §6 Decision 6) so every cell's identity and balance derives
 * from one string that never recomputes on the client across a UTC-midnight boundary. No
 * `actions.ts`: this route has no write path.
 */
export default async function CalendarioPage() {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);

  const [summary, definitions] = spaceId
    ? await Promise.all([getHouseholdSummary(supabase, spaceId), listRecurringDefinitions(supabase, spaceId)])
    : [{ availableCents: 0, debtCents: 0 }, []];

  const fromDate = new Date().toISOString().slice(0, 10);
  // v1 scope is recurring EXPENSE outflows only (design.md §1, confirmed product decision) —
  // transfer-type definitions (e.g. credit-card auto-pay, added later by
  // finance-credit-card-payments) have no categoryId and are excluded here, not projected as
  // spending. `categoryId` is narrowed explicitly since the DB's `recurring_expense_shape`
  // constraint (not TypeScript) is what guarantees expense-type rows always carry one.
  const expenseDefinitions = definitions
    .filter((d) => d.type === "expense")
    .map((d) => ({ ...d, categoryId: d.categoryId as string }));
  const projection = projectBalance(expenseDefinitions, summary.availableCents, fromDate);

  const monthsCells = Object.fromEntries(
    monthsBetween(projection.fromDate, projection.toDate).map((month) => [month, buildMonthCells(projection, month)]),
  );

  const daysByDate = Object.fromEntries(
    projection.days.map((day) => [
      day.date,
      {
        date: day.date,
        closingBalanceCents: day.closingBalanceCents,
        isNegative: day.isNegative,
        occurrences: day.occurrences.map((o) => ({
          definitionId: o.definitionId,
          description: o.description,
          amountCents: o.amountCents,
          overdue: o.overdue,
        })),
      },
    ]),
  );

  return (
    <main className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Calendario</h2>

      <CalendarScreen
        initialMonth={projection.fromDate.slice(0, 7)}
        selectableMonths={Object.keys(monthsCells)}
        monthsCells={monthsCells}
        daysByDate={daysByDate}
        fromDate={projection.fromDate}
        formattedAnchor={formatCentsAsMXN(projection.anchorCents)}
      />
    </main>
  );
}
