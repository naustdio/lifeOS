// THE public surface of the `recipes` module — the only path other modules/the `app` layer may
// import from (Gate A). `server-only` as the first real statement, same as
// `finance/api/index.ts` / `health/api/index.ts`: any client component importing this file fails
// the build.
import "server-only";

export {
  listRecipes,
  getRecipeById,
  createRecipe,
  updateRecipe,
  softDeleteRecipe,
  hardDeleteRecipe,
  setRecipePhoto,
  type RecipeListItem,
  type RecipeDetail,
  type RecipeIngredient,
  type RecipeStep,
  type IngredientInput,
  type StepInput,
} from "../data/recipe-repository";

export {
  uploadRecipePhoto,
  signRecipePhotoUrls,
  buildRecipePhotoPath,
  RECIPE_PHOTO_BUCKET,
} from "../data/recipe-photo-repository";

export { listRecipeChanges, type RecipeChange } from "../data/recipe-history-repository";

export { listCustomUnits } from "../data/custom-unit-repository";

export {
  listIngredientCatalog,
  signIngredientPhotoUrls,
  upsertIngredientCatalogEntry,
  uploadIngredientPhoto,
  buildIngredientPhotoPath,
  INGREDIENT_PHOTO_BUCKET,
  type IngredientCatalogEntry,
} from "../data/ingredient-catalog-repository";

export { RECIPE_CATEGORIES, type RecipeCategory, isValidCategory, reasonIsPresent, normalizePositions } from "../domain/recipe";

export { RECIPE_UNITS, type UnitOption, mergeUnitOptions } from "../domain/unit";
