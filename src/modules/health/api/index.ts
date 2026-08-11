// THE public surface of the `health` module — the only path other modules/the `app` layer may
// import from (design.md "Health `data/` never imports `finance/api`" + Gate A). `server-only`
// as the first real statement, same as `finance/api/index.ts`: any client component importing
// this file fails the build.
import "server-only";

/**
 * Plain re-exports of `../data`'s RLS-guarded CRUD (task 3.5). Health has no seam-only write
 * surface like Finance's `transactions`/`accounts` — every write here is a straightforward
 * owner-or-household RLS-guarded insert/update/delete, the same deliberate
 * `finance.categories`-style exception `finance/api/index.ts` documents for its own
 * budgets/recurring/credit-card re-exports. Re-exported here (not imported directly from
 * `../data` by callers) because Gate A's ESLint boundary only allows `app` to import a module's
 * `api/` barrel, never `data/` directly.
 *
 * NOTE (design.md Decision 5 — composition point): this barrel intentionally re-exports ONLY
 * `../data` and `../domain`. It does NOT import `finance/api` and never will — the ESLint
 * `boundaries/element-types` rule has no `module-api` -> `module-api` (cross-module) allowance
 * at all (only `app` -> `module-api` is legal), so a costed health event's Finance-transaction
 * posting, edit-follows-source update, void-on-delete, and bounded/unbounded recurring
 * definition creation ALL compose at the `app` Server Action layer, calling this barrel and
 * `finance/api` side by side — uniformly, for every touchpoint (confirmed by re-reading
 * design.md's Decision 5 in full: "Health follows the finance->core pattern (explicit params, no
 * import)" states no per-touchpoint exception). That composition is Phase 4 scope
 * (`src/app/(app)/(health)/salud/actions.ts`), not this module's.
 */
export {
  listEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  type EventListItem,
} from "../data/event-repository";

export {
  listVitalReadings,
  createVitalReading,
  deleteVitalReading,
  type VitalReadingListItem,
} from "../data/vital-repository";

// change: nutrition-submodule — photo repository for `health.nutrition_visit_photos` + the
// private `health-nutrition-photos` bucket. Owner-only, independent of the event's visibility
// (design.md Decision 1); re-exported here for the same Gate A reason as every other `data/`
// repository in this barrel.
export {
  NUTRITION_PHOTO_BUCKET,
  buildPhotoPath,
  listVisitPhotos,
  insertPhoto,
  deletePhoto,
  removeObjects,
  createPhotoSignedUrl,
  type NutritionVisitPhoto,
} from "../data/nutrition-photo-repository";

export {
  listProfileFacts,
  createProfileFact,
  updateProfileFact,
  deleteProfileFact,
  type ProfileFactListItem,
} from "../data/profile-repository";

/**
 * Pure domain predicates (task 3.5) — re-exported here for the same Gate A reason
 * `finance/api/index.ts` re-exports `validateRecurringShape`/`supportsCardDetail` from
 * `../domain`: `app` may only import a module's `api/` barrel, never `domain/` directly.
 */
export {
  EVENT_TYPES,
  type EventType,
  isValidEventType,
  VISIBILITIES,
  type Visibility,
  isValidVisibility,
  type WireVisibility,
  toDomainVisibility,
  toWireVisibility,
  costFieldsConsistent,
  type CostFields,
  resultSummaryAllowed,
  dosageAllowed,
  recurringRequiresCost,
  accountSatisfiesEventPrivacy,
  type AccountPrivacyRef,
  remainingAfterPost,
  isBoundedSeriesComplete,
  boundedProgressLabel,
} from "../domain/event";

export { VITAL_METRICS, type VitalMetric, isValidVitalMetric, type VitalEntry, sortForTrend } from "../domain/vital";

export {
  FACT_TYPES,
  type FactType,
  isValidFactType,
  SEVERITIES,
  type Severity,
  severityAllowed,
  type ProfileFactRef,
  bloodTypeAlreadySet,
  currentFacts,
} from "../domain/profile";
