// `health` data layer — Supabase repositories and row <-> entity mappers. Read-only per
// `finance/data/index.ts`'s established convention: client-direct reads under RLS remain fine
// for lists; every cross-module composition (posting a Finance transaction) happens one layer up
// in the `app` Server Action (design.md Decision 5).
export * from "./event-repository";
export * from "./vital-repository";
export * from "./profile-repository";
