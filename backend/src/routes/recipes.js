import express from 'express';
import { getDatabase } from '../db/database.js';
import { SELECT_RECIPE_INGREDIENTS } from '../db/queries.js';
import { getSuggestedCategory } from '../services/categorization.js';
import { propagateCategory } from '../services/categorySync.js';
import { insertRecipeItems, loadItems } from '../services/mealplan.js';
import eventEmitter from '../services/events.js';
import { badRequest, handler, notFound } from '../utils/http.js';

const router = express.Router();

/**
 * Load a recipe together with its ingredients.
 * @param {import('better-sqlite3').Database} db
 * @param {number|string} id
 * @returns {object|null}
 */
function getRecipeWithIngredients(db, id) {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  if (!recipe) return null;

  return {
    ...recipe,
    ingredients: db.prepare(SELECT_RECIPE_INGREDIENTS).all(id),
  };
}

/**
 * Replace the ingredient rows of a recipe. Assumes an open transaction.
 * @param {import('better-sqlite3').Database} db
 * @param {number|string} recipeId
 * @param {object[]} ingredients
 */
function replaceIngredients(db, recipeId, ingredients) {
  db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(recipeId);
  if (ingredients.length === 0) return;

  const insert = db.prepare(`
    INSERT INTO recipe_ingredients (recipe_id, name, description, amount, category_id, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  ingredients.forEach((ing, index) => {
    if (!ing.name || ing.name.trim().length === 0) {
      throw badRequest('Each ingredient must have a name');
    }
    const name = ing.name.trim();
    insert.run(
      recipeId,
      name,
      ing.description?.trim() || null,
      ing.amount?.trim() || null,
      ing.category_id || getSuggestedCategory(name) || null,
      ing.position ?? index
    );
  });
}

/**
 * Push ingredient edits onto the grocery-list items that came from this recipe.
 * Items are matched by name (case-insensitive), so a renamed ingredient leaves
 * its list item untouched rather than guessing at the pairing.
 * Assumes an open transaction.
 * @param {import('better-sqlite3').Database} db
 * @param {number|string} recipeId
 * @param {object[]} ingredients - the ingredients as just stored
 * @returns {number[]} ids of the items that changed
 */
function syncRecipeItems(db, recipeId, ingredients) {
  const items = db.prepare('SELECT id, name FROM items WHERE recipe_id = ?').all(recipeId);
  if (items.length === 0) return [];

  const byName = new Map(ingredients.map((ing) => [ing.name.toLowerCase(), ing]));
  const update = db.prepare(`
    UPDATE items
    SET description = ?, amount = ?, category_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const changedIds = [];
  for (const item of items) {
    const ing = byName.get(item.name.toLowerCase());
    if (!ing) continue;
    update.run(ing.description, ing.amount, ing.category_id, item.id);
    changedIds.push(item.id);
  }
  return changedIds;
}

/**
 * GET /api/recipes
 * Get all recipes (without ingredients)
 */
router.get('/', handler('fetching recipes', (req, res) => {
  res.json(getDatabase().prepare('SELECT * FROM recipes ORDER BY name ASC').all());
}));

/**
 * GET /api/recipes/:id
 * Get a recipe with all its ingredients
 */
router.get('/:id', handler('fetching recipe', (req, res) => {
  const recipe = getRecipeWithIngredients(getDatabase(), req.params.id);
  if (!recipe) throw notFound('Recipe not found');
  res.json(recipe);
}));

/**
 * POST /api/recipes
 * Body: { name, ingredients: [{ name, description, amount, category_id, position }] }
 */
router.post('/', handler('creating recipe', (req, res) => {
  const { name, ingredients = [], is_regular = false, changeId } = req.body;

  if (!name || name.trim().length === 0) {
    throw badRequest('Recipe name is required');
  }

  const db = getDatabase();
  const recipeId = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO recipes (name, is_regular) VALUES (?, ?)')
      .run(name.trim(), is_regular ? 1 : 0);
    replaceIngredients(db, lastInsertRowid, ingredients);
    return lastInsertRowid;
  })();

  const newRecipe = getRecipeWithIngredients(db, recipeId);
  eventEmitter.emitChange('recipe-created', newRecipe, changeId);
  res.status(201).json(newRecipe);
}));

/**
 * PUT /api/recipes/:id
 * Body: { name, ingredients: [...] } - ingredients are replaced wholesale
 */
router.put('/:id', handler('updating recipe', (req, res) => {
  const { id } = req.params;
  const { name, ingredients = [], is_regular, changeId } = req.body;

  if (!name || name.trim().length === 0) {
    throw badRequest('Recipe name is required');
  }

  const db = getDatabase();
  const synced = db.transaction(() => {
    // `is_regular` is optional: only overwrite it when the client sent it.
    const result = is_regular === undefined
      ? db.prepare('UPDATE recipes SET name = ? WHERE id = ?').run(name.trim(), id)
      : db
        .prepare('UPDATE recipes SET name = ?, is_regular = ? WHERE id = ?')
        .run(name.trim(), is_regular ? 1 : 0, id);
    if (result.changes === 0) {
      throw notFound('Recipe not found');
    }
    replaceIngredients(db, id, ingredients);

    const stored = db.prepare('SELECT * FROM recipe_ingredients WHERE recipe_id = ?').all(id);
    const itemIds = new Set(syncRecipeItems(db, id, stored));
    const recipeIds = new Set();

    // A category is a property of the name, so share it with duplicate list
    // items and any other recipe using the same ingredient.
    for (const ing of stored) {
      const fanOut = propagateCategory(db, {
        name: ing.name,
        categoryId: ing.category_id,
        excludeRecipeId: id,
      });
      fanOut.itemIds.forEach((itemId) => itemIds.add(itemId));
      fanOut.recipeIds.forEach((recipeId) => recipeIds.add(recipeId));
    }

    return { itemIds: [...itemIds], recipeIds: [...recipeIds] };
  })();

  const updatedRecipe = getRecipeWithIngredients(db, id);
  eventEmitter.emitChange('recipe-updated', updatedRecipe, changeId);
  synced.recipeIds
    .map((recipeId) => getRecipeWithIngredients(db, recipeId))
    .filter(Boolean)
    .forEach((recipe) => eventEmitter.emitChange('recipe-updated', recipe, changeId));
  loadItems(db, synced.itemIds).forEach((item) => eventEmitter.emitChange('item-updated', item, changeId));
  res.json(updatedRecipe);
}));

/**
 * PATCH /api/recipes/:id/regular
 * Body: { is_regular } - lightweight toggle for the dinner wizard pool
 */
router.patch('/:id/regular', handler('updating recipe', (req, res) => {
  const { id } = req.params;
  const { is_regular, changeId } = req.body ?? {};

  if (typeof is_regular !== 'boolean' && is_regular !== 0 && is_regular !== 1) {
    throw badRequest('is_regular must be a boolean');
  }

  const db = getDatabase();
  const result = db
    .prepare('UPDATE recipes SET is_regular = ? WHERE id = ?')
    .run(is_regular ? 1 : 0, id);
  if (result.changes === 0) {
    throw notFound('Recipe not found');
  }

  const updated = getRecipeWithIngredients(db, id);
  eventEmitter.emitChange('recipe-updated', updated, changeId);
  res.json(updated);
}));

/**
 * DELETE /api/recipes/:id
 * Delete a recipe (cascade deletes ingredients)
 */
router.delete('/:id', handler('deleting recipe', (req, res) => {
  const { id } = req.params;
  const { changeId } = req.body ?? {};

  const result = getDatabase().prepare('DELETE FROM recipes WHERE id = ?').run(id);
  if (result.changes === 0) {
    throw notFound('Recipe not found');
  }

  eventEmitter.emitChange('recipe-deleted', { id: parseInt(id, 10) }, changeId);
  res.status(204).send();
}));

/**
 * POST /api/recipes/:id/add-to-list
 * Add all recipe ingredients to the grocery list
 */
router.post('/:id/add-to-list', handler('adding recipe to list', (req, res) => {
  const { id } = req.params;
  const { changeId } = req.body ?? {};
  const db = getDatabase();

  const ingredients = db.prepare('SELECT * FROM recipe_ingredients WHERE recipe_id = ?').all(id);
  if (ingredients.length === 0) {
    throw notFound('Recipe not found or has no ingredients');
  }

  const addedItemIds = db.transaction(() => insertRecipeItems(db, id, { ingredients }))();

  const addedItems = loadItems(db, addedItemIds);
  addedItems.forEach((item) => eventEmitter.emitChange('item-created', item, changeId));

  res.status(201).json({
    message: 'Recipe ingredients added to list',
    itemsAdded: addedItems.length,
    items: addedItems,
  });
}));

/**
 * DELETE /api/recipes/:id/remove-from-list
 * Remove all grocery list items that came from this recipe
 */
router.delete('/:id/remove-from-list', handler('removing recipe from list', (req, res) => {
  const { id } = req.params;
  const { changeId } = req.body ?? {};
  const db = getDatabase();

  const itemsToRemove = db.prepare('SELECT id FROM items WHERE recipe_id = ?').all(id);
  if (itemsToRemove.length === 0) {
    return res.json({ message: 'No items to remove', itemsRemoved: 0 });
  }

  db.prepare('DELETE FROM items WHERE recipe_id = ?').run(id);
  itemsToRemove.forEach((item) => eventEmitter.emitChange('item-deleted', { id: item.id }, changeId));

  res.json({ message: 'Recipe ingredients removed from list', itemsRemoved: itemsToRemove.length });
}));

export default router;
