/**
 * Canonical grocery list ordering, mirroring the backend's ORDER BY:
 * unchecked items first, then by category order, then manual position,
 * then creation time.
 * @param {object[]} items
 * @returns {object[]} a new, sorted array
 */
export function sortItems(items) {
  return [...items].sort((a, b) => {
    if (Boolean(a.checked) !== Boolean(b.checked)) return a.checked ? 1 : -1;
    if ((a.category_sort_order ?? 0) !== (b.category_sort_order ?? 0)) {
      return (a.category_sort_order ?? 0) - (b.category_sort_order ?? 0);
    }
    if ((a.position_in_list ?? 0) !== (b.position_in_list ?? 0)) {
      return (a.position_in_list ?? 0) - (b.position_in_list ?? 0);
    }
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

/**
 * Position a toggled item within its category: checked items move to the top
 * of the checked group, unchecked ones to the bottom of the unchecked group.
 * Mirrors PATCH /api/items/:id/check so optimistic UI matches the server.
 * @param {object[]} items - All items
 * @param {object} item - The item being toggled
 * @param {boolean} checked - Its new checked state
 * @returns {number} the new position_in_list
 */
export function positionForToggle(items, item, checked) {
  const positions = items
    .filter((i) => Boolean(i.checked) === checked && i.category_id === item.category_id)
    .map((i) => i.position_in_list ?? 0);

  if (positions.length === 0) return checked ? -1 : 1;
  return checked ? Math.min(...positions) - 1 : Math.max(...positions) + 1;
}
