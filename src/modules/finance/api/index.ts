// THE public surface of the `finance` module — the only path other modules
// may import from (design.md §5.1). `finance` MAY depend on `core`, never the
// reverse (module-architecture spec: "Allowed Dependency Direction").
//
// Sub-slice 1A ships only the barrel shape so the ESLint boundary rule (T-002)
// has a real target to enforce against. The real seam
// (`createAccount`, `recordTransaction`, `recordTransfer`, ...) lands in
// sub-slice 2B as a `server-only` facade over the SECURITY DEFINER RPC seam
// (design.md §5).
export {};
