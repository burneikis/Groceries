import { namesMatch } from './names'

/**
 * Order recurring items like the backend does: by the current category order,
 * uncategorised last, then alphabetically by name.
 *
 * Uses the live `categories` array rather than a cached sort order on each
 * item, so reordering categories is reflected immediately.
 *
 * @param {object[]} recurringItems
 * @param {object[]} categories - each with `id` and `sort_order`
 * @returns {object[]} a new, sorted array
 */
export function sortRecurring(recurringItems, categories = []) {
  const order = new Map(categories.map((c) => [c.id, c.sort_order]))
  const rank = (item) => order.get(item.category_id) ?? Number.MAX_SAFE_INTEGER

  return [...recurringItems].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )
}

/**
 * Find a recurring item whose name clashes with `name` (case- and
 * plural-insensitive), ignoring the item being edited.
 * @param {object[]} recurringItems
 * @param {string} name
 * @param {number|null} [excludeId]
 * @returns {object|undefined}
 */
export function findRecurringClash(recurringItems, name, excludeId = null) {
  return recurringItems.find((r) => r.id !== excludeId && namesMatch(r.name, name))
}
