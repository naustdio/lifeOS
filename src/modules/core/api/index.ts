// THE public surface of the `core` module — the only path other modules may
// import from. `core` is the foundational identity kernel and depends on
// nothing else (module-architecture spec: "Allowed Dependency Direction").
//
// Sub-slice 1A ships only the barrel shape so the ESLint boundary rule (T-002)
// has a real target to enforce against. Real exports (profile accessors,
// tenancy helpers) land in sub-slice 1B.
export {};
