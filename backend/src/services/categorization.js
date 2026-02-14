import { getDatabase } from '../db/database.js';

/**
 * Get suggested category for an item based on learned mappings
 * @param {string} itemName - The name of the item
 * @returns {number|null} - The suggested category_id or null if no mapping found
 */
export function getSuggestedCategory(itemName) {
  const db = getDatabase();
  const normalizedName = itemName.toLowerCase().trim();

  const mapping = db
    .prepare('SELECT category_id FROM item_category_mappings WHERE item_name_lower = ?')
    .get(normalizedName);

  return mapping ? mapping.category_id : null;
}

/**
 * Learn or update a category mapping for an item
 * @param {string} itemName - The name of the item
 * @param {number} categoryId - The category ID assigned to the item
 */
export function learnCategoryMapping(itemName, categoryId) {
  const db = getDatabase();
  const normalizedName = itemName.toLowerCase().trim();

  // Check if mapping already exists
  const existing = db
    .prepare('SELECT id, use_count FROM item_category_mappings WHERE item_name_lower = ?')
    .get(normalizedName);

  if (existing) {
    // Update existing mapping
    db.prepare(`
      UPDATE item_category_mappings
      SET category_id = ?, use_count = use_count + 1, last_used = CURRENT_TIMESTAMP
      WHERE item_name_lower = ?
    `).run(categoryId, normalizedName);
  } else {
    // Create new mapping
    db.prepare(`
      INSERT INTO item_category_mappings (item_name_lower, category_id, use_count, last_used)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    `).run(normalizedName, categoryId);
  }
}

/**
 * Update the last used timestamp and increment use count for a mapping
 * @param {string} itemName - The name of the item
 */
export function updateMappingUsage(itemName) {
  const db = getDatabase();
  const normalizedName = itemName.toLowerCase().trim();

  db.prepare(`
    UPDATE item_category_mappings
    SET use_count = use_count + 1, last_used = CURRENT_TIMESTAMP
    WHERE item_name_lower = ?
  `).run(normalizedName);
}

/**
 * Clean up old, unused category mappings
 * Removes mappings that have use_count = 1 and are older than 6 months
 */
export function cleanupOldMappings() {
  const db = getDatabase();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const result = db.prepare(`
    DELETE FROM item_category_mappings
    WHERE use_count = 1 AND last_used < ?
  `).run(sixMonthsAgo.toISOString());

  console.log(`Cleaned up ${result.changes} old category mappings`);
  return result.changes;
}
