import { describe, expect, it } from 'vitest'
import { findRecurringClash, sortRecurring } from './recurring'

const categories = [
  { id: 1, sort_order: 2 },
  { id: 2, sort_order: 1 },
]

describe('sortRecurring', () => {
  it('orders by category sort order, uncategorised last, then by name', () => {
    const sorted = sortRecurring(
      [
        { id: 1, name: 'zucchini', category_id: 1 },
        { id: 2, name: 'Apple', category_id: 1 },
        { id: 3, name: 'Milk', category_id: 2 },
        { id: 4, name: 'Batteries', category_id: null },
      ],
      categories
    )

    expect(sorted.map((r) => r.name)).toEqual(['Milk', 'Apple', 'zucchini', 'Batteries'])
  })

  it('does not mutate its input', () => {
    const input = [{ id: 1, name: 'B' }, { id: 2, name: 'A' }]
    sortRecurring(input)
    expect(input[0].name).toBe('B')
  })
})

describe('findRecurringClash', () => {
  const items = [{ id: 1, name: 'Eggs' }, { id: 2, name: 'Bread' }]

  it('matches ignoring case and plurals', () => {
    expect(findRecurringClash(items, 'egg')).toEqual(items[0])
  })

  it('ignores the item being edited', () => {
    expect(findRecurringClash(items, 'EGGS', 1)).toBeUndefined()
  })

  it('returns undefined for a new name', () => {
    expect(findRecurringClash(items, 'Milk')).toBeUndefined()
  })
})
