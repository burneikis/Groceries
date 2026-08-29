/**
 * Keeping categories consistent across the list and the recipe book.
 *
 * A grocery name has exactly one sensible category, so when the user
 * recategorises "Milk" anywhere we apply that choice to every other copy of
 * "Milk": duplicate list items and every recipe that uses it. Names are
 * matched case-insensitively; amounts, descriptions and check state are never
 * touched, because those legitimately differ between copies.
 *
 * All functions assume an open transaction.
 */

/**
 * Route params arrive as strings; SQLite's `IS NOT` is type-strict, so ids must
 * be numbers for the "skip the row I just wrote" guards to work.
 * @param {number|string|null} id
 * @returns {number|null}
 */
const asId = (id) => (id == null ? null : Number(id));

/**
 * Apply a category to every same-named list item, except the one being edited.
 * @param {import('better-sqlite3').Database} db
 * @param {string} name
 * @param {number|null} categoryId
 * @param {number|string|null} [excludeItemId] - item that already has the value
 * @returns {number[]} ids of the items that changed
 */
export function propagateCategoryToItems(db, name, categoryId, excludeItemId = null) {
  const affected = db.prepare(`
    SELECT id FROM items
    WHERE LOWER(name) = LOWER(?)
      AND id IS NOT ?
      AND category_id IS NOT ?
  `).all(name, asId(excludeItemId), categoryId).map((row) => row.id);

  if (affected.length === 0) return [];

  const update = db.prepare(
    'UPDATE items SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  );
  affected.forEach((id) => update.run(categoryId, id));
  return affected;
}

/**
 * Apply a category to every same-named recipe ingredient.
 * @param {import('better-sqlite3').Database} db
 * @param {string} name
 * @param {number|null} categoryId
 * @param {number|string|null} [excludeRecipeId] - recipe already updated
 * @returns {number[]} ids of the recipes that changed
 */
export function propagateCategoryToRecipes(db, name, categoryId, excludeRecipeId = null) {
  const affected = db.prepare(`
    SELECT DISTINCT recipe_id FROM recipe_ingredients
    WHERE LOWER(name) = LOWER(?)
      AND recipe_id IS NOT ?
      AND category_id IS NOT ?
  `).all(name, asId(excludeRecipeId), categoryId).map((row) => row.recipe_id);

  if (affected.length === 0) return [];

  db.prepare(`
    UPDATE recipe_ingredients
    SET category_id = ?
    WHERE LOWER(name) = LOWER(?) AND recipe_id IS NOT ?
  `).run(categoryId, name, asId(excludeRecipeId));

  return affected;
}

/**
 * Fan a category choice out to both the list and the recipe book.
 * @param {import('better-sqlite3').Database} db
 * @param {object} params
 * @param {string} params.name
 * @param {number|null} params.categoryId
 * @param {number|string|null} [params.excludeItemId]
 * @param {number|string|null} [params.excludeRecipeId]
 * @returns {{itemIds: number[], recipeIds: number[]}}
 */
export function propagateCategory(db, { name, categoryId, excludeItemId = null, excludeRecipeId = null }) {
  return {
    itemIds: propagateCategoryToItems(db, name, categoryId, excludeItemId),
    recipeIds: propagateCategoryToRecipes(db, name, categoryId, excludeRecipeId),
  };
}
