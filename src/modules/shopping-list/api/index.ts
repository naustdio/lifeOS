// THE public surface of the `shopping-list` module — the only path other modules/the `app` layer
// may import from (Gate A), same as `recipes/api/index.ts`. `server-only` as the first real
// statement: any client component importing this file fails the build.
//
// Zero `@/modules/recipes/*` imports in this file or anywhere in this module (spec
// `shopping-list-module-api` "No Direct Cross-Module Import From Recipes") — cross-module
// composition (reading recipe data) happens ONLY in an app-layer Server Action that imports both
// module api barrels side by side (design.md Decision 3), not here.
import "server-only";

export { getOrCreateActiveList, finalizePurchase, type ShoppingList } from "../data/list-repository";

export { listItems, addItems, setChecked, removeItem, type AddItemInput, type ShoppingListItemRow } from "../data/item-repository";

export {
  listStoreTypes,
  ensureBaseStoreTypes,
  createStoreType,
  getIngredientDefaults,
  setIngredientDefault,
  BASE_STORE_TYPES,
  type StoreType,
} from "../data/store-type-repository";

export { combineItems, type CombinedLine, type CombinedLineContributor } from "../domain/combine";

export { scaleQuantity, estimatedTotal } from "../domain/scale";

export {
  listPlannerSlots,
  setPlannerSlot,
  PLANNER_DAYS,
  PLANNER_MEAL_SLOTS,
  type PlannerDay,
  type PlannerMealSlot,
  type PlannerSlot,
} from "../data/planner-repository";
