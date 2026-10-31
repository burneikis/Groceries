import { normalizeName } from '../../utils/names'

/** sessionStorage key for an in-progress wizard, so a refresh is survivable. */
export const DRAFT_KEY = 'mealplan_draft'

/**
 * Human label for when a recipe was last planned.
 * @param {string|null} lastPlannedAt
 * @param {Date} [now]
 * @returns {string}
 */
export function lastCookedLabel(lastPlannedAt, now = new Date()) {
  if (!lastPlannedAt) return 'Never cooked'

  const stamp = `${lastPlannedAt}`.includes('T') ? lastPlannedAt : `${lastPlannedAt}Z`
  const days = Math.floor((now.getTime() - new Date(stamp).getTime()) / 86400000)

  if (Number.isNaN(days)) return 'Never cooked'
  if (days <= 0) return 'Planned today'
  if (days === 1) return 'Planned yesterday'
  if (days < 7) return `Planned ${days} days ago`

  const weeks = Math.floor(days / 7)
  return weeks === 1 ? 'Planned 1 week ago' : `Planned ${weeks} weeks ago`
}

/**
 * Predicate for "this name is already on the list": an unchecked item with the
 * same name (case- and plural-insensitive). Checked items are already bought.
 * @param {object[]} items - Current grocery list items
 * @returns {(name: string) => boolean}
 */
export function onListChecker(items = []) {
  const listed = new Set(items.filter((i) => !i.checked).map((i) => normalizeName(i.name)))
  return (name) => listed.has(normalizeName(name))
}

/**
 * Merge the ingredients of the chosen recipes and the picked recurring items
 * into a review list, one entry per distinct item name (case- and
 * plural-insensitive). A recurring item that matches an ingredient joins that
 * entry, so one checkbox covers both.
 *
 * @param {object[]} recipes - Selected recipes, each with `ingredients`
 * @param {object[]} items - Current grocery list items
 * @param {object[]} [recurring] - Recurring items picked in the wizard
 * @returns {Array<{key: string, name: string, amounts: string[], ingredientIds: number[], recurringIds: number[], recipeNames: string[], onList: boolean}>}
 */
export function buildReviewList(recipes, items = [], recurring = []) {
  const isOnList = onListChecker(items)
  const merged = new Map()

  const entryFor = (rawName) => {
    const key = normalizeName(rawName)
    if (!merged.has(key)) {
      merged.set(key, {
        key,
        name: rawName.trim(),
        amounts: [],
        ingredientIds: [],
        recurringIds: [],
        recipeNames: [],
        onList: isOnList(rawName),
      })
    }
    return merged.get(key)
  }

  recipes.forEach((recipe) => {
    ;(recipe.ingredients ?? []).forEach((ing) => {
      const entry = entryFor(ing.name)
      if (ing.amount) entry.amounts.push(ing.amount)
      entry.ingredientIds.push(ing.id)
      if (!entry.recipeNames.includes(recipe.name)) entry.recipeNames.push(recipe.name)
    })
  })

  recurring.forEach((item) => {
    const entry = entryFor(item.name)
    if (item.amount) entry.amounts.push(item.amount)
    entry.recurringIds.push(item.id)
  })

  return [...merged.values()]
}

/**
 * Where a review entry comes from, e.g. "Pancakes, Recurring".
 * @param {{recipeNames: string[], recurringIds: number[]}} entry
 * @returns {string}
 */
export function reviewSources(entry) {
  const sources = [...entry.recipeNames]
  if (entry.recurringIds.length > 0) sources.push('Recurring')
  return sources.join(', ')
}

/**
 * The stalest pool recipe that is not already chosen and not rejected
 * (swapped/removed) in this wizard session.
 *
 * Once every eligible candidate has been rejected we fall back to the
 * least-recently-rejected one rather than giving up, so swapping never
 * silently stops working. `rejected` is insertion-ordered (see
 * `rejectRecipe`), which makes that fallback rotate through the whole pool
 * instead of ping-ponging between the first two entries.
 *
 * @param {object[]} pool - Pool ordered stalest first
 * @param {object[]} selected
 * @param {Set<number>} [rejected] - Ids swapped/removed this session, oldest first
 * @returns {object|undefined}
 */
export function nextFromPool(pool, selected, rejected = new Set()) {
  const chosen = new Set(selected.map((r) => r.id))
  const eligible = pool.filter((r) => !chosen.has(r.id))

  const fresh = eligible.find((r) => !rejected.has(r.id))
  if (fresh) return fresh

  const order = [...rejected]
  return eligible
    .slice()
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))[0]
}

/**
 * Record a recipe as rejected for this wizard session, moving it to the back
 * of the LRU queue so it is the last thing re-offered.
 * @param {Set<number>} rejected
 * @param {number} recipeId
 * @returns {Set<number>} a new Set
 */
export function rejectRecipe(rejected, recipeId) {
  const next = new Set(rejected)
  next.delete(recipeId)
  next.add(recipeId)
  return next
}
