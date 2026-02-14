import express from 'express';
import { getDatabase } from '../db/database.js';
import {
  getSuggestedCategory,
  learnCategoryMapping,
  updateMappingUsage
} from '../services/categorization.js';

const router = express.Router();

/**
 * GET /api/items
 * Get all items with category information
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const items = db.prepare(`
      SELECT
        items.*,
        categories.name as category_name,
        categories.sort_order as category_sort_order
      FROM items
      LEFT JOIN categories ON items.category_id = categories.id
      ORDER BY
        CASE WHEN items.checked = 1 THEN 1 ELSE 0 END,
        categories.sort_order ASC,
        items.position_in_list ASC,
        items.created_at ASC
    `).all();

    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

/**
 * POST /api/items
 * Create a new item with auto-categorization
 */
router.post('/', (req, res) => {
  try {
    const { name, description, amount, category_id } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    const db = getDatabase();

    // If no category provided, try to auto-categorize
    let finalCategoryId = category_id;
    if (!finalCategoryId) {
      const suggestedCategoryId = getSuggestedCategory(name);
      finalCategoryId = suggestedCategoryId;
    }

    // Get the next position in list
    const maxPosition = db
      .prepare('SELECT MAX(position_in_list) as max FROM items')
      .get();
    const nextPosition = (maxPosition.max || 0) + 1;

    const result = db.prepare(`
      INSERT INTO items (name, description, amount, category_id, position_in_list, checked)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(
      name.trim(),
      description?.trim() || null,
      amount?.trim() || null,
      finalCategoryId || null,
      nextPosition
    );

    // Learn the category mapping if a category was assigned
    if (finalCategoryId) {
      learnCategoryMapping(name, finalCategoryId);
    }

    // Fetch the created item with category info
    const newItem = db.prepare(`
      SELECT
        items.*,
        categories.name as category_name,
        categories.sort_order as category_sort_order
      FROM items
      LEFT JOIN categories ON items.category_id = categories.id
      WHERE items.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

/**
 * PUT /api/items/:id
 * Update an item
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, amount, category_id } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    const db = getDatabase();
    const result = db.prepare(`
      UPDATE items
      SET name = ?, description = ?, amount = ?, category_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name.trim(),
      description?.trim() || null,
      amount?.trim() || null,
      category_id || null,
      id
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Learn/update the category mapping
    if (category_id) {
      learnCategoryMapping(name, category_id);
    }

    // Fetch the updated item with category info
    const updatedItem = db.prepare(`
      SELECT
        items.*,
        categories.name as category_name,
        categories.sort_order as category_sort_order
      FROM items
      LEFT JOIN categories ON items.category_id = categories.id
      WHERE items.id = ?
    `).get(id);

    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

/**
 * PATCH /api/items/:id/check
 * Toggle the checked status of an item
 */
router.patch('/:id/check', (req, res) => {
  try {
    const { id } = req.params;
    const { checked } = req.body;

    if (typeof checked !== 'boolean') {
      return res.status(400).json({ error: 'checked must be a boolean' });
    }

    const db = getDatabase();
    const result = db.prepare(`
      UPDATE items
      SET checked = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(checked ? 1 : 0, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Fetch the updated item with category info
    const updatedItem = db.prepare(`
      SELECT
        items.*,
        categories.name as category_name,
        categories.sort_order as category_sort_order
      FROM items
      LEFT JOIN categories ON items.category_id = categories.id
      WHERE items.id = ?
    `).get(id);

    res.json(updatedItem);
  } catch (error) {
    console.error('Error toggling item check:', error);
    res.status(500).json({ error: 'Failed to toggle item check status' });
  }
});

/**
 * DELETE /api/items/checked
 * Delete all checked items
 * Note: This must come before /:id route to avoid matching "checked" as an id
 */
router.delete('/checked', (req, res) => {
  try {
    const db = getDatabase();

    const result = db
      .prepare('DELETE FROM items WHERE checked = 1')
      .run();

    res.json({
      message: 'Checked items deleted',
      deletedCount: result.changes
    });
  } catch (error) {
    console.error('Error deleting checked items:', error);
    res.status(500).json({ error: 'Failed to delete checked items' });
  }
});

/**
 * DELETE /api/items/:id
 * Delete a single item
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    const result = db
      .prepare('DELETE FROM items WHERE id = ?')
      .run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

export default router;
