// `class` -> headline-inclusion mapping. Pure mirror of the BEFORE INSERT/UPDATE trigger
// (design.md §3.2/§3.4/§5.6) — this is a client-side PREVIEW only; the trigger remains the
// single server-side authority so the headline number can never be forged.

export type AccountType = "cash" | "checking" | "credit_card" | "savings" | "liability" | "savings_goal";
export type AccountClass = "asset" | "liability";

const ASSET_TYPES: ReadonlySet<AccountType> = new Set(["cash", "checking", "savings", "savings_goal"]);

export function deriveAccountClass(type: AccountType): AccountClass {
  return ASSET_TYPES.has(type) ? "asset" : "liability";
}

/** Whether a balance for this type rolls into the "available money" hero figure. */
export function includedInAvailableCents(type: AccountType): boolean {
  return deriveAccountClass(type) === "asset";
}

export function requiresLiabilityDetail(type: AccountType): boolean {
  return type === "liability";
}

export function requiresGoalDetail(type: AccountType): boolean {
  return type === "savings_goal";
}

/** Mirrors the type-gate trigger on `finance.account_credit_card_details` (design.md §1a,
 *  change: finance-credit-card-payments CC-018). Unlike liability/goal detail, card terms are
 *  OPTIONAL even for a `credit_card` account — this only gates whether the fieldset can be
 *  shown, not whether it must be filled. */
export function supportsCardDetail(type: AccountType): boolean {
  return type === "credit_card";
}
