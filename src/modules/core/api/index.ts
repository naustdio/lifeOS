// THE public surface of the `core` module — the only path other modules may
// import from. `core` is the foundational identity kernel and depends on
// nothing else (module-architecture spec: "Allowed Dependency Direction").
export type { Profile } from "../domain/profile";
export { getCurrentProfile } from "../data/profile-repository";
export { getCurrentHouseholdId } from "../data/household-repository";
