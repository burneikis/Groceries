import { SELECT_RECIPE_INGREDIENTS, SELECT_RECURRING_BY_ID } from '../db/queries.js';
import eventEmitter from './events.js';
import { loadItems } from './mealplan.js';

/**
 * Load recurring items (with category info) by id, skipping missing ones.
 * @param {import('better-sqlite3').Database} db
 * @param {number[]} ids
 * @returns {object[]}
 */
export function loadRecurringItems(db, ids) {
  const select = db.prepare(SELECT_RECURRING_BY_ID);
  return ids.map((id) => select.get(id)).filter(Boolean);
}

/**
 * Broadcast `recurring-updated` for each recurring item a category change touched.
 * @param {import('better-sqlite3').Database} db
 * @param {number[]} ids
 * @param {string|null} changeId
 */
export function emitRecurringUpdates(db, ids, changeId) {
  loadRecurringItems(db, ids)
    .forEach((recurring) => eventEmitter.emitChange('recurring-updated', recurring, changeId));
}

/**
 * Broadcast everything a `propagateCategory` call changed.
 * @param {import('better-sqlite3').Database} db
 * @param {{itemIds: number[], recipeIds: number[], recurringIds: number[]}} fanOut
 * @param {string|null} changeId
 */
export function emitCategoryFanOut(db, { itemIds, recipeIds, recurringIds }, changeId) {
  loadItems(db, itemIds).forEach((item) => eventEmitter.emitChange('item-updated', item, changeId));

  const selectIngredients = db.prepare(SELECT_RECIPE_INGREDIENTS);
  recipeIds
    .map((id) => db.prepare('SELECT * FROM recipes WHERE id = ?').get(id))
    .filter(Boolean)
    .map((recipe) => ({ ...recipe, ingredients: selectIngredients.all(recipe.id) }))
    .forEach((recipe) => eventEmitter.emitChange('recipe-updated', recipe, changeId));

  emitRecurringUpdates(db, recurringIds, changeId);
}
