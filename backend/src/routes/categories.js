import express from 'express';
import { getDatabase } from '../db/database.js';
import eventEmitter from '../services/events.js';
import { badRequest, handler, notFound } from '../utils/http.js';

const router = express.Router();

const SELECT_ALL = 'SELECT * FROM categories ORDER BY sort_order ASC';

/**
 * GET /api/categories
 * Get all categories ordered by sort_order
 */
router.get('/', handler('fetching categories', (req, res) => {
  res.json(getDatabase().prepare(SELECT_ALL).all());
}));

/**
 * POST /api/categories
 * Create a new category, appended to the end of the order
 */
router.post('/', handler('creating category', (req, res) => {
  const { name, changeId } = req.body;

  if (!name || name.trim().length === 0) {
    throw badRequest('Category name is required');
  }

  const db = getDatabase();
  const { max } = db.prepare('SELECT MAX(sort_order) as max FROM categories').get();

  const result = db
    .prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)')
    .run(name.trim(), (max || 0) + 1);

  const newCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);

  eventEmitter.emitChange('category-created', newCategory, changeId);
  res.status(201).json(newCategory);
}));

/**
 * PUT /api/categories/reorder
 * Body: { categories: [{ id, sort_order }, ...] }
 * Note: must come before /:id so "reorder" is not matched as an id
 */
router.put('/reorder', handler('reordering categories', (req, res) => {
  const { categories, changeId } = req.body;

  if (!Array.isArray(categories)) {
    throw badRequest('categories must be an array');
  }

  const db = getDatabase();
  const stmt = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');

  db.transaction(() => {
    for (const cat of categories) {
      if (!cat.id || cat.sort_order === undefined) {
        throw badRequest('Each category must have id and sort_order');
      }
      stmt.run(cat.sort_order, cat.id);
    }
  })();

  const updated = db.prepare(SELECT_ALL).all();
  eventEmitter.emitChange('categories-reordered', updated, changeId);
  res.json(updated);
}));

/**
 * PUT /api/categories/:id
 * Update category name
 */
router.put('/:id', handler('updating category', (req, res) => {
  const { id } = req.params;
  const { name, changeId } = req.body;

  if (!name || name.trim().length === 0) {
    throw badRequest('Category name is required');
  }

  const db = getDatabase();
  const result = db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name.trim(), id);

  if (result.changes === 0) {
    throw notFound('Category not found');
  }

  const updatedCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  eventEmitter.emitChange('category-updated', updatedCategory, changeId);
  res.json(updatedCategory);
}));

/**
 * DELETE /api/categories/:id
 * Delete a category, detaching anything that referenced it
 */
router.delete('/:id', handler('deleting category', (req, res) => {
  const { id } = req.params;
  const { changeId } = req.body ?? {};
  const db = getDatabase();

  const result = db.transaction(() => {
    db.prepare('UPDATE items SET category_id = NULL WHERE category_id = ?').run(id);
    db.prepare('UPDATE recipe_ingredients SET category_id = NULL WHERE category_id = ?').run(id);
    db.prepare('UPDATE recurring_items SET category_id = NULL WHERE category_id = ?').run(id);
    db.prepare('DELETE FROM item_category_mappings WHERE category_id = ?').run(id);
    return db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  })();

  if (result.changes === 0) {
    throw notFound('Category not found');
  }

  eventEmitter.emitChange('category-deleted', { id: parseInt(id, 10) }, changeId);
  res.status(204).send();
}));

export default router;
