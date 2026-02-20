import express from 'express';
import { getDatabase } from '../db/database.js';
import { learnCategoryMapping, getSuggestedCategory } from '../services/categorization.js';
import eventEmitter from '../services/events.js';

const router = express.Router();

/**
 * GET /api/recipes
 * Get all recipes (without ingredients)
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const recipes = db
      .prepare('SELECT * FROM recipes ORDER BY name ASC')
      .all();

    res.json(recipes);
  } catch (error) {
    console.error('Error fetching recipes:', error);
    res.status(500).json({ error: 'Failed to fetch recipes' });
  }
});

/**
 * GET /api/recipes/:id
 * Get a recipe with all its ingredients
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    const recipe = db
      .prepare('SELECT * FROM recipes WHERE id = ?')
      .get(id);

    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

    const ingredients = db.prepare(`
      SELECT
        recipe_ingredients.*,
        categories.name as category_name
      FROM recipe_ingredients
      LEFT JOIN categories ON recipe_ingredients.category_id = categories.id
      WHERE recipe_id = ?
      ORDER BY position ASC
    `).all(id);

    res.json({
      ...recipe,
      ingredients
    });
  } catch (error) {
    console.error('Error fetching recipe:', error);
    res.status(500).json({ error: 'Failed to fetch recipe' });
  }
});

/**
 * POST /api/recipes
 * Create a new recipe with ingredients
 * Body: { name: string, ingredients: [{ name, description, amount, category_id, position }] }
 */
router.post('/', (req, res) => {
  try {
    const { name, ingredients = [], changeId } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Recipe name is required' });
    }

    const db = getDatabase();

    // Use transaction to create recipe and ingredients atomically
    const createRecipe = db.transaction(() => {
      // Create recipe
      const recipeResult = db
        .prepare('INSERT INTO recipes (name) VALUES (?)')
        .run(name.trim());

      const recipeId = recipeResult.lastInsertRowid;

      // Insert ingredients
      if (ingredients.length > 0) {
        const insertIngredient = db.prepare(`
          INSERT INTO recipe_ingredients (recipe_id, name, description, amount, category_id, position)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const ing of ingredients) {
          if (!ing.name || ing.name.trim().length === 0) {
            throw new Error('Each ingredient must have a name');
          }

          const categoryId = ing.category_id || getSuggestedCategory(ing.name.trim());

          insertIngredient.run(
            recipeId,
            ing.name.trim(),
            ing.description?.trim() || null,
            ing.amount?.trim() || null,
            categoryId || null,
            ing.position || 0
          );
        }
      }

      return recipeId;
    });

    const newRecipeId = createRecipe();

    // Fetch the created recipe with ingredients
    const newRecipe = db
      .prepare('SELECT * FROM recipes WHERE id = ?')
      .get(newRecipeId);

    const recipeIngredients = db.prepare(`
      SELECT
        recipe_ingredients.*,
        categories.name as category_name
      FROM recipe_ingredients
      LEFT JOIN categories ON recipe_ingredients.category_id = categories.id
      WHERE recipe_id = ?
      ORDER BY position ASC
    `).all(newRecipeId);

    const newRecipeWithIngredients = {
      ...newRecipe,
      ingredients: recipeIngredients
    };

    // Emit event for real-time updates
    eventEmitter.emitChange('recipe-created', newRecipeWithIngredients, changeId);

    res.status(201).json(newRecipeWithIngredients);
  } catch (error) {
    console.error('Error creating recipe:', error);
    res.status(500).json({ error: error.message || 'Failed to create recipe' });
  }
});

/**
 * PUT /api/recipes/:id
 * Update a recipe and its ingredients
 * Body: { name: string, ingredients: [{ name, description, amount, category_id, position }] }
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, ingredients = [], changeId } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Recipe name is required' });
    }

    const db = getDatabase();

    // Use transaction for atomic update
    const updateRecipe = db.transaction(() => {
      // Update recipe name
      const result = db
        .prepare('UPDATE recipes SET name = ? WHERE id = ?')
        .run(name.trim(), id);

      if (result.changes === 0) {
        throw new Error('Recipe not found');
      }

      // Delete existing ingredients
      db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(id);

      // Insert new ingredients
      if (ingredients.length > 0) {
        const insertIngredient = db.prepare(`
          INSERT INTO recipe_ingredients (recipe_id, name, description, amount, category_id, position)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const ing of ingredients) {
          if (!ing.name || ing.name.trim().length === 0) {
            throw new Error('Each ingredient must have a name');
          }

          const categoryId = ing.category_id || getSuggestedCategory(ing.name.trim());

          insertIngredient.run(
            id,
            ing.name.trim(),
            ing.description?.trim() || null,
            ing.amount?.trim() || null,
            categoryId || null,
            ing.position || 0
          );
        }
      }
    });

    updateRecipe();

    // Fetch the updated recipe with ingredients
    const updatedRecipe = db
      .prepare('SELECT * FROM recipes WHERE id = ?')
      .get(id);

    const recipeIngredients = db.prepare(`
      SELECT
        recipe_ingredients.*,
        categories.name as category_name
      FROM recipe_ingredients
      LEFT JOIN categories ON recipe_ingredients.category_id = categories.id
      WHERE recipe_id = ?
      ORDER BY position ASC
    `).all(id);

    const updatedRecipeWithIngredients = {
      ...updatedRecipe,
      ingredients: recipeIngredients
    };

    // Emit event for real-time updates
    eventEmitter.emitChange('recipe-updated', updatedRecipeWithIngredients, changeId);

    res.json(updatedRecipeWithIngredients);
  } catch (error) {
    console.error('Error updating recipe:', error);
    if (error.message === 'Recipe not found') {
      res.status(404).json({ error: 'Recipe not found' });
    } else {
      res.status(500).json({ error: error.message || 'Failed to update recipe' });
    }
  }
});

/**
 * DELETE /api/recipes/:id
 * Delete a recipe (cascade deletes ingredients)
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { changeId } = req.body;
    const db = getDatabase();

    const result = db
      .prepare('DELETE FROM recipes WHERE id = ?')
      .run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

    // Emit event for real-time updates
    eventEmitter.emitChange('recipe-deleted', { id: parseInt(id) }, changeId);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting recipe:', error);
    res.status(500).json({ error: 'Failed to delete recipe' });
  }
});

/**
 * POST /api/recipes/:id/add-to-list
 * Add all recipe ingredients to the grocery list
 */
router.post('/:id/add-to-list', (req, res) => {
  try {
    const { id } = req.params;
    const { changeId } = req.body;
    const db = getDatabase();

    // Get recipe ingredients
    const ingredients = db.prepare(`
      SELECT * FROM recipe_ingredients WHERE recipe_id = ?
    `).all(id);

    if (ingredients.length === 0) {
      return res.status(404).json({ error: 'Recipe not found or has no ingredients' });
    }

    // Get the next position in list
    const maxPosition = db
      .prepare('SELECT MAX(position_in_list) as max FROM items')
      .get();
    let nextPosition = (maxPosition.max || 0) + 1;

    // Add each ingredient to items
    const addToList = db.transaction(() => {
      const insertItem = db.prepare(`
        INSERT INTO items (name, description, amount, category_id, position_in_list, checked)
        VALUES (?, ?, ?, ?, ?, 0)
      `);

      const addedItems = [];

      for (const ing of ingredients) {
        const result = insertItem.run(
          ing.name,
          ing.description || null,
          ing.amount || null,
          ing.category_id || null,
          nextPosition++
        );

        // Learn category mapping
        if (ing.category_id) {
          learnCategoryMapping(ing.name, ing.category_id);
        }

        addedItems.push(result.lastInsertRowid);
      }

      return addedItems;
    });

    const addedItemIds = addToList();

    // Fetch the added items with category info
    const addedItems = db.prepare(`
      SELECT
        items.*,
        categories.name as category_name,
        categories.sort_order as category_sort_order
      FROM items
      LEFT JOIN categories ON items.category_id = categories.id
      WHERE items.id IN (${addedItemIds.map(() => '?').join(',')})
    `).all(...addedItemIds);

    // Emit events for each created item
    addedItems.forEach(item => {
      eventEmitter.emitChange('item-created', item, changeId);
    });

    res.status(201).json({
      message: 'Recipe ingredients added to list',
      itemsAdded: addedItems.length,
      items: addedItems
    });
  } catch (error) {
    console.error('Error adding recipe to list:', error);
    res.status(500).json({ error: 'Failed to add recipe to list' });
  }
});

export default router;
