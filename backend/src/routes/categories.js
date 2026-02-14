import express from 'express';
import { getDatabase } from '../db/database.js';

const router = express.Router();

/**
 * GET /api/categories
 * Get all categories ordered by sort_order
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const categories = db
      .prepare('SELECT * FROM categories ORDER BY sort_order ASC')
      .all();

    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * POST /api/categories
 * Create a new category
 */
router.post('/', (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const db = getDatabase();

    // Get the next sort_order (max + 1)
    const maxOrder = db
      .prepare('SELECT MAX(sort_order) as max FROM categories')
      .get();
    const nextOrder = (maxOrder.max || 0) + 1;

    const result = db
      .prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)')
      .run(name.trim(), nextOrder);

    const newCategory = db
      .prepare('SELECT * FROM categories WHERE id = ?')
      .get(result.lastInsertRowid);

    res.status(201).json(newCategory);
  } catch (error) {
    console.error('Error creating category:', error);
    if (error.message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Category name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create category' });
    }
  }
});

/**
 * PUT /api/categories/reorder
 * Update sort_order for all categories
 * Body: [{ id: 1, sort_order: 1 }, { id: 2, sort_order: 2 }, ...]
 * Note: This must come before /:id route to avoid matching "reorder" as an id
 */
router.put('/reorder', (req, res) => {
  try {
    const categories = req.body;

    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: 'Request body must be an array' });
    }

    const db = getDatabase();

    // Use a transaction for atomic updates
    const updateOrder = db.transaction((cats) => {
      const stmt = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
      for (const cat of cats) {
        if (!cat.id || cat.sort_order === undefined) {
          throw new Error('Each category must have id and sort_order');
        }
        stmt.run(cat.sort_order, cat.id);
      }
    });

    updateOrder(categories);

    // Return updated categories
    const updated = db
      .prepare('SELECT * FROM categories ORDER BY sort_order ASC')
      .all();

    res.json(updated);
  } catch (error) {
    console.error('Error reordering categories:', error);
    res.status(500).json({ error: 'Failed to reorder categories' });
  }
});

/**
 * PUT /api/categories/:id
 * Update category name
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const db = getDatabase();
    const result = db
      .prepare('UPDATE categories SET name = ? WHERE id = ?')
      .run(name.trim(), id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const updatedCategory = db
      .prepare('SELECT * FROM categories WHERE id = ?')
      .get(id);

    res.json(updatedCategory);
  } catch (error) {
    console.error('Error updating category:', error);
    if (error.message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Category name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update category' });
    }
  }
});

/**
 * DELETE /api/categories/:id
 * Delete a category
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    // Check if category has items
    const itemCount = db
      .prepare('SELECT COUNT(*) as count FROM items WHERE category_id = ?')
      .get(id);

    if (itemCount.count > 0) {
      return res.status(409).json({
        error: 'Cannot delete category with items',
        itemCount: itemCount.count
      });
    }

    const result = db
      .prepare('DELETE FROM categories WHERE id = ?')
      .run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;
