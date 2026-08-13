"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentHouseholdId } from "@/modules/core/api";
import {
  createAccount,
  deleteAccount,
  setAccountArchived,
  supportsCardDetail,
  updateAccount,
  upsertCardDetails,
  type AccountType,
  type CreateAccountInput,
  type UpdateAccountInput,
} from "@/modules/finance/api";
import { pesosToCents } from "@/shared/money";
import { createClient } from "@/shared/supabase/server";

export type AccountFormState = {
  error: string | null;
};

const ERROR_COPY: Record<string, string> = {
  ACCOUNT_DETAIL_REQUIRED:
    "Ese tipo de cuenta requiere los datos adicionales correctos (o el saldo inicial no puede ser positivo).",
  NOT_A_MEMBER: "No tienes acceso a este espacio.",
  VALIDATION_ERROR: "Revisa los datos del formulario.",
  NOT_FOUND: "No se encontró la cuenta.",
  // change: finance-account-edit T4.3 — 2BP01 -> ACCOUNT_HAS_HISTORY, points to Pause instead.
  ACCOUNT_HAS_HISTORY:
    "Esta cuenta tiene movimientos registrados y no se puede eliminar. Podés pausarla en su lugar.",
};

function toOptionalCents(raw: FormDataEntryValue | null): number | undefined {
  if (!raw || String(raw).trim() === "") return undefined;
  return pesosToCents(Number(raw));
}

/** Server Action backing the account-creation form (T-036). Builds a
 * `CreateAccountInput` discriminated union from the submitted form and
 * calls the ONLY write path for accounts, `finance.api.createAccount()`. */
export async function createAccountAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) {
    return { error: ERROR_COPY.NOT_A_MEMBER };
  }

  const type = String(formData.get("type") ?? "") as AccountType;
  const name = String(formData.get("name") ?? "").trim();
  const openingBalanceCents = toOptionalCents(formData.get("openingBalance")) ?? 0;

  const base = { householdId: spaceId, name, openingBalanceCents };

  let input: CreateAccountInput;
  if (type === "liability") {
    input = {
      ...base,
      type,
      liability: {
        originalAmountCents: toOptionalCents(formData.get("originalAmount")) ?? 0,
        interestRateBp: Number(formData.get("interestRateBp") ?? 0),
        termMonths: Number(formData.get("termMonths") ?? 0),
        monthlyPaymentCents: toOptionalCents(formData.get("monthlyPayment")) ?? 0,
        startDate: String(formData.get("startDate") ?? ""),
      },
    };
  } else if (type === "savings_goal") {
    const targetDate = String(formData.get("targetDate") ?? "");
    input = {
      ...base,
      type,
      goal: {
        targetAmountCents: toOptionalCents(formData.get("targetAmount")) ?? 0,
        targetDate: targetDate || undefined,
      },
    };
  } else if (type === "investment") {
    const valuedOn = String(formData.get("valuedOn") ?? "");
    input = {
      ...base,
      type,
      investment: {
        costBasisCents: toOptionalCents(formData.get("costBasis")) ?? 0,
        currentValueCents: toOptionalCents(formData.get("currentValue")),
        valuedOn: valuedOn || undefined,
      },
    };
  } else if (type === "loaned") {
    const expected = String(formData.get("expectedReturnDate") ?? "");
    const term = Number(formData.get("termMonths") ?? 0);
    input = {
      ...base,
      type,
      loaned: {
        counterpartyName: String(formData.get("counterpartyName") ?? "").trim(),
        originalAmountCents: toOptionalCents(formData.get("originalAmount")) ?? 0,
        termMonths: term > 0 ? term : undefined,
        expectedReturnDate: expected || undefined,
      },
    };
  } else {
    input = { ...base, type };
  }

  const result = await createAccount(input);
  if (!result.ok) {
    return { error: ERROR_COPY[result.error.code] ?? result.error.message };
  }

  // Step 2 of 2 (design.md §4, CC-022): card terms live in a separate optional table under
  // plain RLS, never in `create_account`'s own atomic RPC (design.md Decision 2). All four
  // fields are optional; submitting the fieldset empty writes no detail row. A failure here
  // leaves a valid card with no terms — the defined empty state, not a broken account.
  if (supportsCardDetail(type)) {
    const creditLimitCents = toOptionalCents(formData.get("creditLimitCents"));
    const statementDayRaw = formData.get("statementDay");
    const dueDayRaw = formData.get("dueDay");
    const minPaymentCents = toOptionalCents(formData.get("minPaymentCents"));
    const statementDay = statementDayRaw && String(statementDayRaw).trim() !== "" ? Number(statementDayRaw) : undefined;
    const dueDay = dueDayRaw && String(dueDayRaw).trim() !== "" ? Number(dueDayRaw) : undefined;

    if (
      creditLimitCents !== undefined ||
      statementDay !== undefined ||
      dueDay !== undefined ||
      minPaymentCents !== undefined
    ) {
      await upsertCardDetails(supabase, result.value.id, {
        creditLimitCents,
        statementDay,
        dueDay,
        minPaymentCents,
      });
    }
  }

  revalidatePath("/cuentas");
  revalidatePath("/finance");
  redirect("/cuentas");
}

/**
 * Server Action backing `EditAccountForm.tsx`'s "Guardar" form (change: finance-account-edit
 * T4.3). Rename + retype. Confirmation (detail-loss / class-flip) already happened client-side
 * before this action is ever invoked (`EditAccountForm.tsx`'s inline confirmation panel,
 * design.md Decision 6) — this action performs the actual write, unconditionally.
 */
export async function updateAccountAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) {
    return { error: ERROR_COPY.NOT_A_MEMBER };
  }

  const accountId = String(formData.get("accountId") ?? "");
  const type = String(formData.get("type") ?? "") as AccountType;
  const name = String(formData.get("name") ?? "").trim();

  const base = { accountId, householdId: spaceId, name };

  let input: UpdateAccountInput;
  if (type === "liability") {
    input = {
      ...base,
      type,
      liability: {
        originalAmountCents: toOptionalCents(formData.get("originalAmount")) ?? 0,
        interestRateBp: Number(formData.get("interestRateBp") ?? 0),
        termMonths: Number(formData.get("termMonths") ?? 0),
        monthlyPaymentCents: toOptionalCents(formData.get("monthlyPayment")) ?? 0,
        startDate: String(formData.get("startDate") ?? ""),
      },
    };
  } else if (type === "savings_goal") {
    const targetDate = String(formData.get("targetDate") ?? "");
    input = {
      ...base,
      type,
      goal: {
        targetAmountCents: toOptionalCents(formData.get("targetAmount")) ?? 0,
        targetDate: targetDate || undefined,
      },
    };
  } else if (type === "investment") {
    const valuedOn = String(formData.get("valuedOn") ?? "");
    input = {
      ...base,
      type,
      investment: {
        costBasisCents: toOptionalCents(formData.get("costBasis")) ?? 0,
        currentValueCents: toOptionalCents(formData.get("currentValue")),
        valuedOn: valuedOn || undefined,
      },
    };
  } else if (type === "loaned") {
    const expected = String(formData.get("expectedReturnDate") ?? "");
    const term = Number(formData.get("termMonths") ?? 0);
    input = {
      ...base,
      type,
      loaned: {
        counterpartyName: String(formData.get("counterpartyName") ?? "").trim(),
        originalAmountCents: toOptionalCents(formData.get("originalAmount")) ?? 0,
        termMonths: term > 0 ? term : undefined,
        expectedReturnDate: expected || undefined,
      },
    };
  } else {
    input = { ...base, type };
  }

  const result = await updateAccount(input);
  if (!result.ok) {
    return { error: ERROR_COPY[result.error.code] ?? result.error.message };
  }

  // Step 2 of 2, same reasoning as `createAccountAction` above: card terms live in a separate
  // optional table under plain RLS. Leaving `credit_card` deletes no card-terms row (design.md
  // open question — the row cascades only on account delete, not retype); entering
  // `credit_card` may carry new terms from the submitted form.
  if (supportsCardDetail(type)) {
    const creditLimitCents = toOptionalCents(formData.get("creditLimitCents"));
    const statementDayRaw = formData.get("statementDay");
    const dueDayRaw = formData.get("dueDay");
    const minPaymentCents = toOptionalCents(formData.get("minPaymentCents"));
    const statementDay = statementDayRaw && String(statementDayRaw).trim() !== "" ? Number(statementDayRaw) : undefined;
    const dueDay = dueDayRaw && String(dueDayRaw).trim() !== "" ? Number(dueDayRaw) : undefined;

    if (
      creditLimitCents !== undefined ||
      statementDay !== undefined ||
      dueDay !== undefined ||
      minPaymentCents !== undefined
    ) {
      await upsertCardDetails(supabase, accountId, {
        creditLimitCents,
        statementDay,
        dueDay,
        minPaymentCents,
      });
    }
  }

  revalidatePath("/cuentas");
  revalidatePath(`/cuentas/${accountId}/editar`);
  revalidatePath("/finance");
  redirect("/cuentas");
}

/**
 * Server Action backing the pause/reactivate control (change: finance-account-edit T4.4).
 * The `window.confirm` gate for pause happens client-side, matching `RecurringList.tsx`'s
 * convention — this action performs the write unconditionally once invoked.
 */
export async function setAccountArchivedAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) {
    return { error: ERROR_COPY.NOT_A_MEMBER };
  }

  const accountId = String(formData.get("accountId") ?? "");
  const archived = formData.get("archived") === "true";

  const result = await setAccountArchived({ accountId, householdId: spaceId, archived });
  if (!result.ok) {
    return { error: ERROR_COPY[result.error.code] ?? result.error.message };
  }

  revalidatePath("/cuentas");
  revalidatePath(`/cuentas/${accountId}/editar`);
  revalidatePath("/finance");
  return { error: null };
}

/**
 * Server Action backing the delete control's typed-confirmation panel (change:
 * finance-account-edit T4.5). Refuses (via `finance.delete_account`'s `2BP01`) when the
 * account has any transaction/recurring history — surfaced through `ACCOUNT_HAS_HISTORY`,
 * never a silent archive fallback.
 */
export async function deleteAccountAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const supabase = await createClient();
  const spaceId = await getCurrentHouseholdId(supabase);
  if (!spaceId) {
    return { error: ERROR_COPY.NOT_A_MEMBER };
  }

  const accountId = String(formData.get("accountId") ?? "");

  const result = await deleteAccount({ accountId, householdId: spaceId });
  if (!result.ok) {
    return { error: ERROR_COPY[result.error.code] ?? result.error.message };
  }

  revalidatePath("/cuentas");
  revalidatePath("/finance");
  redirect("/cuentas");
}
