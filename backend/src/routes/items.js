import express from 'express';
import { getDatabase } from '../db/database.js';
import { SELECT_ALL_ITEMS, SELECT_ITEM_BY_ID } from '../db/queries.js';
import { getSuggestedCategory, learnCategoryMapping } from '../services/categorization.js';
import eventEmitter from '../services/events.js';
import { badRequest, handler, notFound } from '../utils/http.js';

const router = express.Router();

/** @returns {object[]} every item in canonical list order */
const allItems = (db) => db.prepare(SELECT_ALL_ITEMS).all();

/** @returns {object|undefined} a single item with its category info */
const itemById = (db, id) => db.prepare(SELECT_ITEM_BY_ID).get(id);

/**
 * GET /api/items
 * Get all items with category information
 */
router.get('/', handler('fetching items', (req, res) => {
  res.json(allItems(getDatabase()));
}));

/**
 * GET /api/items/suggest-category?name=...
 * Return a suggested category_id for the given item name based on learned mappings
 */
router.get('/suggest-category', handler('suggesting category', (req, res) => {
  const { name } = req.query;
  if (!name || name.trim().length === 0) {
    throw badRequest('name query param is required');
  }
  res.json({ category_id: getSuggestedCategory(name.trim()) });
}));

/**
 * POST /api/items
 * Create a new item, auto-categorizing it when no category is supplied
 */
router.post('/', handler('creating item', (req, res) => {
  const { name, description, amount, category_id, changeId } = req.body;

  if (!name || name.trim().length === 0) {
    throw badRequest('Item name is required');
  }

  const db = getDatabase();
  const categoryId = category_id || getSuggestedCategory(name) || null;

  const { max } = db.prepare('SELECT MAX(position_in_list) as max FROM items').get();

  const result = db.prepare(`
    INSERT INTO items (name, description, amount, category_id, position_in_list, checked)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(
    name.trim(),
    description?.trim() || null,
    amount?.trim() || null,
    categoryId,
    (max || 0) + 1
  );

  if (categoryId) {
    learnCategoryMapping(name, categoryId);
  }

  const newItem = itemById(db, result.lastInsertRowid);
  eventEmitter.emitChange('item-created', newItem, changeId);
  res.status(201).json(newItem);
}));

/**
 * PUT /api/items/reorder
 * Reorder items by updating their position_in_list
 * Note: must come before /:id so "reorder" is not matched as an id
 */
router.put('/reorder', handler('reordering items', (req, res) => {
  const { items, changeId } = req.body;
  if (!Array.isArray(items)) {
    throw badRequest('items must be an array');
  }

  const db = getDatabase();
  const update = db.prepare('UPDATE items SET position_in_list = ? WHERE id = ?');
  db.transaction(() => {
    for (const { id, position_in_list } of items) {
      update.run(position_in_list, id);
    }
  })();

  const updatedItems = allItems(db);
  eventEmitter.emitChange('items-reordered', updatedItems, changeId);
  res.json(updatedItems);
}));

/**
 * DELETE /api/items/checked
 * Delete checked items. When `ids` is supplied only those items are removed,
 * which keeps an offline client's replayed request from deleting items that
 * somebody else checked in the meantime.
 * Note: must come before /:id so "checked" is not matched as an id
 */
router.delete('/checked', handler('deleting checked items', (req, res) => {
  const { ids, changeId } = req.body ?? {};
  const db = getDatabase();

  let deletedIds;
  if (Array.isArray(ids)) {
    const placeholders = Array(ids.length).fill('?').join(',');
    deletedIds = ids.length === 0
      ? []
      : db.prepare(`SELECT id FROM items WHERE checked = 1 AND id IN (${placeholders})`)
          .all(...ids)
          .map((row) => row.id);
  } else {
    deletedIds = db.prepare('SELECT id FROM items WHERE checked = 1').all().map((row) => row.id);
  }

  if (deletedIds.length > 0) {
    const placeholders = Array(deletedIds.length).fill('?').join(',');
    db.prepare(`DELETE FROM items WHERE id IN (${placeholders})`).run(...deletedIds);
  }

  eventEmitter.emitChange('items-deleted-checked', { ids: deletedIds }, changeId);
  res.json({ message: 'Checked items deleted', deletedCount: deletedIds.length });
}));

/**
 * PUT /api/items/:id
 * Update an item
 */
router.put('/:id', handler('updating item', (req, res) => {
  const { id } = req.params;
  const { name, description, amount, category_id, changeId } = req.body;

  if (!name || name.trim().length === 0) {
    throw badRequest('Item name is required');
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
    throw notFound('Item not found');
  }

  if (category_id) {
    learnCategoryMapping(name, category_id);
  }

  const updatedItem = itemById(db, id);
  eventEmitter.emitChange('item-updated', updatedItem, changeId);
  res.json(updatedItem);
}));

/**
 * PATCH /api/items/:id/check
 * Toggle the checked status of an item, repositioning it within its category:
 * newly checked items go to the top of the checked group, unchecked items to
 * the bottom of the unchecked group.
 */
router.patch('/:id/check', handler('toggling item check', (req, res) => {
  const { id } = req.params;
  const { checked, changeId } = req.body;

  if (typeof checked !== 'boolean') {
    throw badRequest('checked must be a boolean');
  }

  const db = getDatabase();
  const item = db.prepare('SELECT category_id FROM items WHERE id = ?').get(id);
  if (!item) {
    throw notFound('Item not found');
  }

  const boundary = db.prepare(`
    SELECT COALESCE(MAX(position_in_list), 0) as max_pos,
           COALESCE(MIN(position_in_list), 0) as min_pos
    FROM items
    WHERE checked = ? AND category_id IS ?
  `).get(checked ? 1 : 0, item.category_id);

  const position = checked ? boundary.min_pos - 1 : boundary.max_pos + 1;

  db.transaction(() => {
    db.prepare(`
      UPDATE items
      SET checked = ?, position_in_list = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(checked ? 1 : 0, position, id);
  })();

  const updatedItem = itemById(db, id);
  eventEmitter.emitChange('item-updated', updatedItem, changeId);
  res.json(updatedItem);
}));

/**
 * DELETE /api/items/:id
 * Delete a single item
 */
router.delete('/:id', handler('deleting item', (req, res) => {
  const { id } = req.params;
  const { changeId } = req.body ?? {};

  const result = getDatabase().prepare('DELETE FROM items WHERE id = ?').run(id);
  if (result.changes === 0) {
    throw notFound('Item not found');
  }

  eventEmitter.emitChange('item-deleted', { id: parseInt(id, 10) }, changeId);
  res.status(204).send();
}));

export default router;
