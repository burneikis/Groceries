import express from 'express';
import { getDatabase } from '../db/database.js';
import { SELECT_RECIPE_INGREDIENTS } from '../db/queries.js';
import eventEmitter from '../services/events.js';
import {
  DEFAULT_COUNT,
  getCandidateRecipes,
  insertRecipeItems,
  loadItems,
  nextItemPosition,
  pickSuggestions,
  stampPlanned,
} from '../services/mealplan.js';
import { badRequest, handler, notFound } from '../utils/http.js';

const router = express.Router();

/** Attach ingredients so the wizard can show counts and build a review list. */
function withIngredients(db, recipes) {
  const select = db.prepare(SELECT_RECIPE_INGREDIENTS);
  return recipes.map((recipe) => ({ ...recipe, ingredients: select.all(recipe.id) }));
}

/**
 * GET /api/mealplan/suggestions?count=4
 * Suggested dinners plus the full pool of regulars (stalest first) for swaps.
 */
router.get('/suggestions', handler('fetching meal plan suggestions', (req, res) => {
  const db = getDatabase();
  const parsed = parseInt(req.query.count, 10);
  const count = Number.isNaN(parsed) ? DEFAULT_COUNT : parsed;

  if (count < 1 || count > 14) {
    throw badRequest('count must be between 1 and 14');
  }

  const { suggestions, pool } = pickSuggestions(getCandidateRecipes(db), { count });

  res.json({
    suggestions: withIngredients(db, suggestions),
    pool: withIngredients(db, pool),
  });
}));

/**
 * POST /api/mealplan/confirm
 * Body: { recipeIds: [...], excludedIngredientIds?: [...], changeId }
 * Adds every recipe's ingredients to the list and stamps the plan history.
 */
router.post('/confirm', handler('confirming meal plan', (req, res) => {
  const { recipeIds, excludedIngredientIds = [], changeId } = req.body ?? {};

  if (!Array.isArray(recipeIds) || recipeIds.length === 0) {
    throw badRequest('recipeIds must be a non-empty array');
  }

  const db = getDatabase();
  const ids = recipeIds.map((id) => parseInt(id, 10));
  if (ids.some((id) => Number.isNaN(id))) {
    throw badRequest('recipeIds must be numeric');
  }

  const excluded = new Set(excludedIngredientIds.map((id) => parseInt(id, 10)));

  const addedItemIds = db.transaction(() => {
    let position = nextItemPosition(db);
    const inserted = [];

    for (const id of ids) {
      const recipe = db.prepare('SELECT id FROM recipes WHERE id = ?').get(id);
      if (!recipe) throw notFound(`Recipe ${id} not found`);

      const ingredients = db
        .prepare('SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position ASC')
        .all(id)
        .filter((ing) => !excluded.has(ing.id));

      const itemIds = insertRecipeItems(db, id, { startPosition: position, ingredients });
      position += itemIds.length;
      inserted.push(...itemIds);
    }

    stampPlanned(db, ids);
    return inserted;
  })();

  const addedItems = loadItems(db, addedItemIds);
  addedItems.forEach((item) => eventEmitter.emitChange('item-created', item, changeId));

  const plannedRecipes = ids.map((id) => db.prepare('SELECT * FROM recipes WHERE id = ?').get(id));
  plannedRecipes.forEach((recipe) => eventEmitter.emitChange('recipe-updated', recipe, changeId));

  res.status(201).json({
    message: 'Meal plan added to list',
    itemsAdded: addedItems.length,
    items: addedItems,
    recipes: plannedRecipes,
  });
}));

export default router;
