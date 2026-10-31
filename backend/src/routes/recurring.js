import express from 'express';
import { getDatabase } from '../db/database.js';
import { SELECT_ALL_RECURRING, SELECT_RECURRING_BY_ID } from '../db/queries.js';
import { getSuggestedCategory } from '../services/categorization.js';
import { propagateCategory } from '../services/categorySync.js';
import eventEmitter from '../services/events.js';
import { emitCategoryFanOut } from '../services/recurring.js';
import { badRequest, conflict, handler, notFound } from '../utils/http.js';
import { namesMatch } from '../utils/names.js';

const router = express.Router();

/**
 * Validate and normalise a recurring item body.
 * @returns {{name: string, description: string|null, amount: string|null, category_id: number|null}}
 */
function parseBody(body) {
  const { name, description, amount, category_id } = body ?? {};
  if (!name || name.trim().length === 0) {
    throw badRequest('Recurring item name is required');
  }
  const trimmed = name.trim();
  return {
    name: trimmed,
    description: description?.trim() || null,
    amount: amount?.trim() || null,
    category_id: category_id || null,
  };
}

/**
 * Reject a name that matches another recurring item (case- and
 * plural-insensitive), so "milk" cannot sit next to "Milk".
 */
function assertUniqueName(db, name, excludeId = null) {
  const clash = db
    .prepare('SELECT id, name FROM recurring_items')
    .all()
    .find((row) => row.id !== Number(excludeId) && namesMatch(row.name, name));
  if (clash) {
    throw conflict(`"${clash.name}" is already a recurring item`);
  }
}

const recurringById = (db, id) => db.prepare(SELECT_RECURRING_BY_ID).get(id);

/**
 * GET /api/recurring
 * Every recurring item, in category order then by name
 */
router.get('/', handler('fetching recurring items', (req, res) => {
  res.json(getDatabase().prepare(SELECT_ALL_RECURRING).all());
}));

/**
 * POST /api/recurring
 * Body: { name, description?, amount?, category_id?, changeId }
 */
router.post('/', handler('creating recurring item', (req, res) => {
  const fields = parseBody(req.body);
  const { changeId } = req.body;
  const db = getDatabase();

  const { id, fanOut } = db.transaction(() => {
    assertUniqueName(db, fields.name);
    const categoryId = fields.category_id || getSuggestedCategory(fields.name) || null;
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO recurring_items (name, description, amount, category_id)
      VALUES (?, ?, ?, ?)
    `).run(fields.name, fields.description, fields.amount, categoryId);

    // Only an explicit choice is shared; a suggestion came from elsewhere already.
    const shared = fields.category_id
      ? propagateCategory(db, {
        name: fields.name,
        categoryId,
        excludeRecurringId: lastInsertRowid,
      })
      : { itemIds: [], recipeIds: [], recurringIds: [] };

    return { id: lastInsertRowid, fanOut: shared };
  })();

  const created = recurringById(db, id);
  eventEmitter.emitChange('recurring-created', created, changeId);
  emitCategoryFanOut(db, fanOut, changeId);
  res.status(201).json(created);
}));

/**
 * PUT /api/recurring/:id
 * Body: { name, description?, amount?, category_id?, changeId }
 */
router.put('/:id', handler('updating recurring item', (req, res) => {
  const { id } = req.params;
  const fields = parseBody(req.body);
  const { changeId } = req.body;
  const db = getDatabase();

  const fanOut = db.transaction(() => {
    assertUniqueName(db, fields.name, id);
    const result = db.prepare(`
      UPDATE recurring_items
      SET name = ?, description = ?, amount = ?, category_id = ?
      WHERE id = ?
    `).run(fields.name, fields.description, fields.amount, fields.category_id, id);
    if (result.changes === 0) {
      throw notFound('Recurring item not found');
    }

    return propagateCategory(db, {
      name: fields.name,
      categoryId: fields.category_id,
      excludeRecurringId: id,
    });
  })();

  const updated = recurringById(db, id);
  eventEmitter.emitChange('recurring-updated', updated, changeId);
  emitCategoryFanOut(db, fanOut, changeId);
  res.json(updated);
}));

/**
 * DELETE /api/recurring/:id
 * List items already added from it are left alone.
 */
router.delete('/:id', handler('deleting recurring item', (req, res) => {
  const { id } = req.params;
  const { changeId } = req.body ?? {};

  const result = getDatabase().prepare('DELETE FROM recurring_items WHERE id = ?').run(id);
  if (result.changes === 0) {
    throw notFound('Recurring item not found');
  }

  eventEmitter.emitChange('recurring-deleted', { id: parseInt(id, 10) }, changeId);
  res.status(204).send();
}));

export default router;
