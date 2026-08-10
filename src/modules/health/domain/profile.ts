// Pure TypeScript mirror of `health.profile_facts`'s CHECK constraints + unique index
// (design.md Schema, migration `20260804090033_health_schema.sql`). Zero Supabase/framework
// imports.
// `Visibility`/`isValidVisibility` live in `./event` and are re-exported once from
// `domain/index.ts`'s `export * from "./event"` — not re-exported here too, to avoid a
// `export *` ambiguous-name collision across three barrels for the same origin binding.

/** Mirrors `health.profile_facts.fact_type` CHECK (design.md Schema; spec `health-profile`
 *  "Profile Facts Are Not Date-Stamped Events"). */
export const FACT_TYPES = ["blood_type", "allergy", "condition"] as const;
export type FactType = (typeof FACT_TYPES)[number];

export function isValidFactType(value: string): value is FactType {
  return (FACT_TYPES as readonly string[]).includes(value);
}

/** Mirrors `profile_severity_only_allergy` — `severity` is only legal on an `allergy` fact. */
export const SEVERITIES = ["low", "medium", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];

export function severityAllowed(factType: FactType): boolean {
  return factType === "allergy";
}

export type ProfileFactRef = { factType: FactType; active: boolean };

/** Mirrors `profile_one_blood_type` (partial unique index on `owner_user_id` where
 *  `fact_type = 'blood_type'`) — a defensive client-side check so the create form can warn
 *  before the DB rejects the insert with `23505`. */
export function bloodTypeAlreadySet(existingFacts: readonly ProfileFactRef[]): boolean {
  return existingFacts.some((f) => f.factType === "blood_type");
}

/** Spec `health-profile` "Profile Reflects Current State" — the current value of each fact is
 *  the ACTIVE ones, without the caller reconstructing state from history. Pure filter. */
export function currentFacts<T extends ProfileFactRef>(facts: readonly T[]): T[] {
  return facts.filter((f) => f.active);
}
