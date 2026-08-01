import express from 'express';
import { getDatabase } from '../db/database.js';
import { SELECT_RECIPE_INGREDIENTS, selectItemsByIds } from '../db/queries.js';
import { getSuggestedCategory, learnCategoryMapping } from '../services/categorization.js';
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
  const { name, ingredients = [], changeId } = req.body;

  if (!name || name.trim().length === 0) {
    throw badRequest('Recipe name is required');
  }

  const db = getDatabase();
  const recipeId = db.transaction(() => {
    const { lastInsertRowid } = db.prepare('INSERT INTO recipes (name) VALUES (?)').run(name.trim());
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
  const { name, ingredients = [], changeId } = req.body;

  if (!name || name.trim().length === 0) {
    throw badRequest('Recipe name is required');
  }

  const db = getDatabase();
  db.transaction(() => {
    const result = db.prepare('UPDATE recipes SET name = ? WHERE id = ?').run(name.trim(), id);
    if (result.changes === 0) {
      throw notFound('Recipe not found');
    }
    replaceIngredients(db, id, ingredients);
  })();

  const updatedRecipe = getRecipeWithIngredients(db, id);
  eventEmitter.emitChange('recipe-updated', updatedRecipe, changeId);
  res.json(updatedRecipe);
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

  const recipe = db.prepare('SELECT name FROM recipes WHERE id = ?').get(id);
  const { max } = db.prepare('SELECT MAX(position_in_list) as max FROM items').get();

  const addedItemIds = db.transaction(() => {
    const insertItem = db.prepare(`
      INSERT INTO items (name, description, amount, category_id, position_in_list, checked, recipe_id, recipe_name)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `);

    let nextPosition = (max || 0) + 1;
    return ingredients.map((ing) => {
      const result = insertItem.run(
        ing.name,
        ing.description || null,
        ing.amount || null,
        ing.category_id || null,
        nextPosition++,
        parseInt(id, 10),
        recipe?.name || null
      );
      if (ing.category_id) {
        learnCategoryMapping(ing.name, ing.category_id);
      }
      return result.lastInsertRowid;
    });
  })();

  const addedItems = db.prepare(selectItemsByIds(addedItemIds.length)).all(...addedItemIds);
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
