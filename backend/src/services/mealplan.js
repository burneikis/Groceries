import { selectItemsByIds } from '../db/queries.js';
import { learnCategoryMapping } from './categorization.js';
import { placeItem } from './itemPlacement.js';

/** Default number of dinners suggested per week. */
export const DEFAULT_COUNT = 4;

/** A recipe that was never planned should always sort ahead of planned ones. */
const NEVER_PLANNED_DAYS = Number.MAX_SAFE_INTEGER;

/**
 * Days between `planned` and `now`, or a very large number if never planned.
 * @param {string|null} plannedAt
 * @param {Date} now
 * @returns {number}
 */
export function stalenessInDays(plannedAt, now) {
  if (!plannedAt) return NEVER_PLANNED_DAYS;
  const then = new Date(`${plannedAt}`.includes('T') ? plannedAt : `${plannedAt}Z`);
  if (Number.isNaN(then.getTime())) return NEVER_PLANNED_DAYS;
  return (now.getTime() - then.getTime()) / 86400000;
}

/**
 * Pick this week's dinners.
 *
 * Staleness only sorts, it never excludes: a small pool of regulars must still
 * be able to fill `count`. Randomising within a "stale bucket" twice the size
 * of the request keeps the ordering fresh week to week.
 *
 * @param {object[]} recipes - Candidate recipes (already filtered to regulars)
 * @param {object} [options]
 * @param {number} [options.count=4]
 * @param {Date} [options.now]
 * @param {() => number} [options.random] - Injectable RNG for tests
 * @returns {{suggestions: object[], pool: object[]}}
 */
export function pickSuggestions(recipes, { count = DEFAULT_COUNT, now = new Date(), random = Math.random } = {}) {
  const pool = [...recipes].sort(
    (a, b) =>
      stalenessInDays(b.last_planned_at, now) - stalenessInDays(a.last_planned_at, now) ||
      (a.plan_count ?? 0) - (b.plan_count ?? 0) ||
      a.id - b.id
  );

  const wanted = Math.max(0, Math.min(count, pool.length));
  const bucket = pool.slice(0, Math.min(pool.length, Math.max(wanted * 2, wanted)));
  const suggestions = [];

  while (suggestions.length < wanted && bucket.length > 0) {
    const index = Math.min(bucket.length - 1, Math.floor(random() * bucket.length));
    suggestions.push(bucket.splice(index, 1)[0]);
  }

  // Keep the returned order stable (stalest first) regardless of draw order.
  const rank = new Map(pool.map((recipe, i) => [recipe.id, i]));
  suggestions.sort((a, b) => rank.get(a.id) - rank.get(b.id));

  return { suggestions, pool };
}

/**
 * Regular recipes eligible for suggestion: not already on the grocery list.
 * @param {import('better-sqlite3').Database} db
 * @returns {object[]}
 */
export function getCandidateRecipes(db) {
  return db
    .prepare(
      `SELECT * FROM recipes
       WHERE is_regular = 1
         AND id NOT IN (SELECT DISTINCT recipe_id FROM items WHERE recipe_id IS NOT NULL)`
    )
    .all();
}

/**
 * Insert a recipe's ingredients as grocery items. Assumes an open transaction.
 *
 * Shared by `POST /api/recipes/:id/add-to-list` and the dinner wizard so both
 * paths behave identically (category learning included).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number|string} recipeId
 * @param {object} [options]
 * @param {number} [options.startPosition] - First position_in_list to use
 * @param {object[]} [options.ingredients] - Pre-fetched ingredient rows
 * @returns {number[]} ids of the inserted items
 */
export function insertRecipeItems(db, recipeId, { startPosition, ingredients } = {}) {
  const rows =
    ingredients ??
    db.prepare('SELECT * FROM recipe_ingredients WHERE recipe_id = ?').all(recipeId);
  if (rows.length === 0) return [];

  const recipe = db.prepare('SELECT name FROM recipes WHERE id = ?').get(recipeId);
  return insertListItems(db, rows, {
    startPosition,
    recipeId: parseInt(recipeId, 10),
    recipeName: recipe?.name || null,
  });
}

/**
 * Insert recurring items as grocery items marked `is_recurring`.
 * Assumes an open transaction.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object[]} rows - recurring_items rows
 * @param {object} [options]
 * @param {number} [options.startPosition] - First position_in_list to use
 * @returns {number[]} ids of the inserted items
 */
export function insertRecurringItems(db, rows, { startPosition } = {}) {
  return insertListItems(db, rows, { startPosition, isRecurring: true });
}

/**
 * Insert template rows (recipe ingredients or recurring items) as list items,
 * placing each next to any unchecked duplicate and learning its category.
 * Assumes an open transaction.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object[]} rows - { name, description, amount, category_id }
 * @param {object} source
 * @param {number} [source.startPosition]
 * @param {number|null} [source.recipeId]
 * @param {string|null} [source.recipeName]
 * @param {boolean} [source.isRecurring]
 * @returns {number[]} ids of the inserted items
 */
function insertListItems(db, rows, { startPosition, recipeId = null, recipeName = null, isRecurring = false }) {
  const insertItem = db.prepare(`
    INSERT INTO items
      (name, description, amount, category_id, position_in_list, checked, recipe_id, recipe_name, is_recurring)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
  `);

  let nextPosition = startPosition ?? nextItemPosition(db);

  return rows.map((row) => {
    const { position, categoryId } = placeItem(db, row.name, row.category_id || null, {
      fallbackPosition: nextPosition,
      preferGivenCategory: Boolean(row.category_id)
    });
    if (position === nextPosition) nextPosition++;

    const result = insertItem.run(
      row.name,
      row.description || null,
      row.amount || null,
      categoryId,
      position,
      recipeId,
      recipeName,
      isRecurring ? 1 : 0
    );
    if (row.category_id) {
      learnCategoryMapping(row.name, row.category_id);
    }
    return Number(result.lastInsertRowid);
  });
}

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {number} the next free position at the end of the list
 */
export function nextItemPosition(db) {
  const { max } = db.prepare('SELECT MAX(position_in_list) as max FROM items').get();
  return (max || 0) + 1;
}

/**
 * Load full item rows (with category info) for the given ids.
 * @param {import('better-sqlite3').Database} db
 * @param {number[]} ids
 * @returns {object[]}
 */
export function loadItems(db, ids) {
  if (ids.length === 0) return [];
  return db.prepare(selectItemsByIds(ids.length)).all(...ids);
}

/**
 * Record that a set of recipes was planned: history row + denormalised
 * `last_planned_at` / `plan_count`. Assumes an open transaction.
 * @param {import('better-sqlite3').Database} db
 * @param {number[]} recipeIds
 */
export function stampPlanned(db, recipeIds) {
  const history = db.prepare('INSERT INTO recipe_plan_history (recipe_id) VALUES (?)');
  const bump = db.prepare(
    `UPDATE recipes
     SET last_planned_at = CURRENT_TIMESTAMP,
         plan_count = COALESCE(plan_count, 0) + 1
     WHERE id = ?`
  );

  recipeIds.forEach((id) => {
    history.run(id);
    bump.run(id);
  });
}
