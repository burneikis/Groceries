import { normalizeName } from '../utils/names.js';

/**
 * Find an unchecked item that is the same ingredient as `name`
 * (case-insensitive, plural-insensitive).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} name
 * @returns {object|undefined} the matching row, latest position first
 */
export function findDuplicateItem(db, name) {
  const key = normalizeName(name);
  if (!key) return undefined;

  return db
    .prepare('SELECT id, name, category_id, position_in_list FROM items WHERE checked = 0 ORDER BY position_in_list ASC')
    .all()
    .find((row) => normalizeName(row.name) === key);
}

/**
 * Work out where a new item should go so that duplicates end up next to each
 * other. When a duplicate exists the new item takes its category and position;
 * the canonical ordering breaks that tie by created_at, so the new item lands
 * directly after the existing one without renumbering the rest of the list.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} name
 * @param {number|null} categoryId - category chosen for the new item
 * @param {object} [options]
 * @param {number} [options.fallbackPosition] - position when there is no duplicate
 * @param {boolean} [options.preferGivenCategory] - keep `categoryId` even when a
 *   duplicate sits in another category (used for user-chosen categories)
 * @returns {{ position: number, categoryId: number|null }}
 */
export function placeItem(db, name, categoryId, { fallbackPosition, preferGivenCategory } = {}) {
  const duplicate = findDuplicateItem(db, name);
  if (!duplicate) {
    const { max } = db.prepare('SELECT MAX(position_in_list) as max FROM items').get();
    return { position: fallbackPosition ?? (max || 0) + 1, categoryId };
  }

  return {
    position: duplicate.position_in_list,
    categoryId: preferGivenCategory ? categoryId ?? null : duplicate.category_id ?? categoryId ?? null
  };
}
