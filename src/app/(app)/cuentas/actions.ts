"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentHouseholdId } from "@/modules/core/api";
import { createAccount, type AccountType, type CreateAccountInput } from "@/modules/finance/api";
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
  } else if (type === "investment" || type === "loaned") {
    // `investment`/`loaned` fieldsets land in Slice B (finance-account-types-expansion B-003/
    // B-004). Slice A only widens the shared `AccountType`/`CreateAccountInput` contracts — the
    // form's `TYPE_LABELS` still lists 6 entries, so this branch is unreachable from the current
    // UI. It exists purely so Slice A's own type-widening compiles standalone (both branches
    // require a detail object the pre-Slice-B form never submits).
    return { error: ERROR_COPY.VALIDATION_ERROR };
  } else {
    input = { ...base, type };
  }

  const result = await createAccount(input);
  if (!result.ok) {
    return { error: ERROR_COPY[result.error.code] ?? result.error.message };
  }

  revalidatePath("/cuentas");
  revalidatePath("/");
  redirect("/cuentas");
}
