/**
 * Shared SQL fragments. The item projection (item + its category name and
 * sort order) was previously copy-pasted into seven different route handlers.
 */

/** Columns returned for every grocery item, including joined category info. */
export const ITEM_COLUMNS = `
  items.*,
  categories.name as category_name,
  categories.sort_order as category_sort_order
`;

export const ITEM_FROM = `
  FROM items
  LEFT JOIN categories ON items.category_id = categories.id
`;

/** Canonical list ordering: unchecked first, then category, position, age. */
export const ITEM_ORDER = `
  ORDER BY
    CASE WHEN items.checked = 1 THEN 1 ELSE 0 END,
    categories.sort_order ASC,
    items.position_in_list ASC,
    items.created_at ASC
`;

export const SELECT_ALL_ITEMS = `SELECT ${ITEM_COLUMNS} ${ITEM_FROM} ${ITEM_ORDER}`;
export const SELECT_ITEM_BY_ID = `SELECT ${ITEM_COLUMNS} ${ITEM_FROM} WHERE items.id = ?`;

/**
 * SELECT for a variable-length list of item ids.
 * @param {number} count - Number of ids that will be bound
 */
export const selectItemsByIds = (count) =>
  `SELECT ${ITEM_COLUMNS} ${ITEM_FROM} WHERE items.id IN (${Array(count).fill('?').join(',')})`;

/** Ingredients of a recipe, with category name, in display order. */
export const SELECT_RECIPE_INGREDIENTS = `
  SELECT
    recipe_ingredients.*,
    categories.name as category_name
  FROM recipe_ingredients
  LEFT JOIN categories ON recipe_ingredients.category_id = categories.id
  WHERE recipe_id = ?
  ORDER BY position ASC
`;

/** Recurring items with category info, in category order then by name. */
const RECURRING_SELECT = `
  SELECT
    recurring_items.*,
    categories.name as category_name,
    categories.sort_order as category_sort_order
  FROM recurring_items
  LEFT JOIN categories ON recurring_items.category_id = categories.id
`;

export const SELECT_ALL_RECURRING = `
  ${RECURRING_SELECT}
  ORDER BY
    CASE WHEN categories.sort_order IS NULL THEN 1 ELSE 0 END,
    categories.sort_order ASC,
    recurring_items.name COLLATE NOCASE ASC
`;

export const SELECT_RECURRING_BY_ID = `${RECURRING_SELECT} WHERE recurring_items.id = ?`;
