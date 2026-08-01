import { describe, expect, it } from 'vitest';
import { positionForToggle, sortItems } from './sortItems';

const item = (overrides) => ({
  id: 1,
  checked: 0,
  category_sort_order: 1,
  position_in_list: 1,
  created_at: '2024-01-01T00:00:00Z',
  category_id: 1,
  ...overrides,
});

describe('sortItems', () => {
  it('puts unchecked items before checked ones', () => {
    const items = [
      item({ id: 1, checked: 1 }),
      item({ id: 2, checked: 0 }),
    ];

    expect(sortItems(items).map((i) => i.id)).toEqual([2, 1]);
  });

  it('treats truthy/falsy checked values consistently', () => {
    const items = [
      item({ id: 1, checked: true }),
      item({ id: 2, checked: false }),
    ];

    expect(sortItems(items).map((i) => i.id)).toEqual([2, 1]);
  });

  it('orders by category sort order next', () => {
    const items = [
      item({ id: 1, category_sort_order: 3 }),
      item({ id: 2, category_sort_order: 1 }),
      item({ id: 3, category_sort_order: 2 }),
    ];

    expect(sortItems(items).map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it('orders by manual position within a category', () => {
    const items = [
      item({ id: 1, position_in_list: 3 }),
      item({ id: 2, position_in_list: 1 }),
      item({ id: 3, position_in_list: 2 }),
    ];

    expect(sortItems(items).map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it('falls back to creation time as a stable tiebreak', () => {
    const items = [
      item({ id: 1, created_at: '2024-03-01T00:00:00Z' }),
      item({ id: 2, created_at: '2024-01-01T00:00:00Z' }),
    ];

    expect(sortItems(items).map((i) => i.id)).toEqual([2, 1]);
  });

  it('applies the full precedence: checked, then category, then position', () => {
    const items = [
      item({ id: 1, checked: 1, category_sort_order: 1, position_in_list: 1 }),
      item({ id: 2, checked: 0, category_sort_order: 2, position_in_list: 5 }),
      item({ id: 3, checked: 0, category_sort_order: 1, position_in_list: 9 }),
      item({ id: 4, checked: 0, category_sort_order: 1, position_in_list: 2 }),
    ];

    expect(sortItems(items).map((i) => i.id)).toEqual([4, 3, 2, 1]);
  });

  it('treats a missing category order as zero so uncategorized items sort first', () => {
    const items = [
      item({ id: 1, category_sort_order: 1 }),
      item({ id: 2, category_sort_order: null }),
    ];

    expect(sortItems(items).map((i) => i.id)).toEqual([2, 1]);
  });

  it('does not mutate the input array', () => {
    const items = [item({ id: 1, position_in_list: 2 }), item({ id: 2, position_in_list: 1 })];
    const snapshot = [...items];

    sortItems(items);

    expect(items).toEqual(snapshot);
  });

  it('handles empty and single-element lists', () => {
    expect(sortItems([])).toEqual([]);
    expect(sortItems([item({ id: 1 })])).toHaveLength(1);
  });
});

describe('positionForToggle', () => {
  it('places a newly checked item above the existing checked group', () => {
    const target = item({ id: 3, category_id: 1 });
    const items = [
      item({ id: 1, checked: 1, category_id: 1, position_in_list: 5 }),
      item({ id: 2, checked: 1, category_id: 1, position_in_list: 8 }),
      target,
    ];

    expect(positionForToggle(items, target, true)).toBe(4); // min(5, 8) - 1
  });

  it('places a newly unchecked item below the existing unchecked group', () => {
    const target = item({ id: 3, checked: 1, category_id: 1 });
    const items = [
      item({ id: 1, checked: 0, category_id: 1, position_in_list: 2 }),
      item({ id: 2, checked: 0, category_id: 1, position_in_list: 7 }),
      target,
    ];

    expect(positionForToggle(items, target, false)).toBe(8); // max(2, 7) + 1
  });

  it('only considers items in the same category', () => {
    const target = item({ id: 3, category_id: 1 });
    const items = [
      item({ id: 1, checked: 1, category_id: 2, position_in_list: -100 }),
      target,
    ];

    expect(positionForToggle(items, target, true)).toBe(-1); // other category ignored
  });

  it('uses sensible defaults when the destination group is empty', () => {
    // An unchecked item being checked: no checked items exist yet.
    const unchecked = item({ id: 1, checked: 0, category_id: 1 });
    expect(positionForToggle([unchecked], unchecked, true)).toBe(-1);

    // A checked item being unchecked: no unchecked items exist yet.
    const checked = item({ id: 2, checked: 1, category_id: 1 });
    expect(positionForToggle([checked], checked, false)).toBe(1);
  });

  it('matches the server for the common check-then-uncheck round trip', () => {
    // Mirrors PATCH /api/items/:id/check so optimistic UI does not jump.
    const target = item({ id: 2, category_id: 1, position_in_list: 3 });
    const items = [item({ id: 1, checked: 0, category_id: 1, position_in_list: 1 }), target];

    const checkedPos = positionForToggle(items, target, true);
    expect(checkedPos).toBe(-1); // no checked items yet in this category

    const nowChecked = { ...target, checked: 1, position_in_list: checkedPos };
    const uncheckedPos = positionForToggle([items[0], nowChecked], nowChecked, false);
    expect(uncheckedPos).toBe(2); // back below the unchecked group
  });
});
