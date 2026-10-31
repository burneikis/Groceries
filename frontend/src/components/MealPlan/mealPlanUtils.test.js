import { describe, expect, it } from 'vitest';
import { buildReviewList, lastCookedLabel, nextFromPool, reviewSources } from './mealPlanUtils';

const now = new Date('2024-06-10T12:00:00Z');
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

describe('lastCookedLabel', () => {
  it('handles the never-planned case', () => {
    expect(lastCookedLabel(null, now)).toBe('Never cooked');
  });

  it('describes recent and older plans', () => {
    expect(lastCookedLabel(daysAgo(0), now)).toBe('Planned today');
    expect(lastCookedLabel(daysAgo(1), now)).toBe('Planned yesterday');
    expect(lastCookedLabel(daysAgo(3), now)).toBe('Planned 3 days ago');
    expect(lastCookedLabel(daysAgo(7), now)).toBe('Planned 1 week ago');
    expect(lastCookedLabel(daysAgo(21), now)).toBe('Planned 3 weeks ago');
  });

  it('reads a bare SQLite datetime as UTC', () => {
    expect(lastCookedLabel('2024-06-03 12:00:00', now)).toBe('Planned 1 week ago');
  });
});

describe('buildReviewList', () => {
  const recipes = [
    { name: 'Chilli', ingredients: [{ id: 1, name: 'Beans', amount: '400g' }, { id: 2, name: 'Mince' }] },
    { name: 'Curry', ingredients: [{ id: 3, name: 'beans', amount: '200g' }] },
  ];

  it('merges ingredients by lowercased name and credits every recipe', () => {
    const [beans, mince] = buildReviewList(recipes);

    expect(beans).toMatchObject({
      name: 'Beans',
      ingredientIds: [1, 3],
      recipeNames: ['Chilli', 'Curry'],
      amounts: ['400g', '200g'],
    });
    expect(mince.recipeNames).toEqual(['Chilli']);
  });

  it('merges plural and singular spellings', () => {
    const list = buildReviewList([
      { name: 'Salad', ingredients: [{ id: 1, name: 'Tomatoes' }] },
      { name: 'Pasta', ingredients: [{ id: 2, name: 'tomato' }] },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].ingredientIds).toEqual([1, 2]);
  });

  it('merges recurring items into matching ingredients and adds the rest', () => {
    const [beans, , milk] = buildReviewList(recipes, [], [
      { id: 7, name: 'Bean', amount: '1 can' },
      { id: 8, name: 'Milk' },
    ]);

    expect(beans).toMatchObject({ recurringIds: [7], amounts: ['400g', '200g', '1 can'] });
    expect(reviewSources(beans)).toBe('Chilli, Curry, Recurring');
    expect(milk).toMatchObject({ name: 'Milk', recurringIds: [8], ingredientIds: [], recipeNames: [] });
    expect(reviewSources(milk)).toBe('Recurring');
  });

  it('ignores checked list items when flagging duplicates', () => {
    const [beans] = buildReviewList(recipes, [{ name: 'Beans', checked: 1 }]);
    expect(beans.onList).toBe(false);
  });

  it('flags ingredients already on the list', () => {
    const [beans, mince] = buildReviewList(recipes, [{ name: ' beans ' }]);

    expect(beans.onList).toBe(true);
    expect(mince.onList).toBe(false);
  });
});

describe('nextFromPool', () => {
  const pool = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('returns the stalest recipe that is not already chosen', () => {
    expect(nextFromPool(pool, [{ id: 1 }])).toEqual({ id: 2 });
  });

  it('returns undefined once the pool is exhausted', () => {
    expect(nextFromPool(pool, pool)).toBeUndefined();
  });
});
