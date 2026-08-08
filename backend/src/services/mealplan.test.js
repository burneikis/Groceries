import { describe, expect, it } from 'vitest';
import { pickSuggestions, stalenessInDays } from './mealplan.js';

const now = new Date('2024-06-10T12:00:00Z');
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

/** Deterministic RNG: always draws the first entry of the bucket. */
const firstPick = () => 0;

const recipe = (id, lastPlannedAt = null, plan_count = 0) => ({
  id,
  name: `Recipe ${id}`,
  last_planned_at: lastPlannedAt,
  plan_count,
});

describe('stalenessInDays', () => {
  it('treats a never-planned recipe as maximally stale', () => {
    expect(stalenessInDays(null, now)).toBeGreaterThan(1e6);
  });

  it('measures whole days since the stamp', () => {
    expect(stalenessInDays(daysAgo(7), now)).toBeCloseTo(7, 5);
  });

  it('reads a bare SQLite datetime as UTC', () => {
    expect(stalenessInDays('2024-06-03 12:00:00', now)).toBeCloseTo(7, 5);
  });
});

describe('pickSuggestions', () => {
  it('orders the pool stalest first, never-planned ahead of everything', () => {
    const { pool } = pickSuggestions(
      [recipe(1, daysAgo(2)), recipe(2, null), recipe(3, daysAgo(30))],
      { now, random: firstPick }
    );

    expect(pool.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('picks `count` recipes from the stale bucket', () => {
    const recipes = [1, 2, 3, 4, 5, 6].map((id) => recipe(id, daysAgo(id)));
    const { suggestions } = pickSuggestions(recipes, { count: 2, now, random: firstPick });

    expect(suggestions.map((r) => r.id)).toEqual([6, 5]);
  });

  it('is deterministic with an injected RNG', () => {
    const recipes = [1, 2, 3, 4, 5, 6].map((id) => recipe(id, daysAgo(id)));
    const random = () => 0.99;

    const a = pickSuggestions(recipes, { count: 3, now, random });
    const b = pickSuggestions(recipes, { count: 3, now, random });
    expect(a.suggestions.map((r) => r.id)).toEqual(b.suggestions.map((r) => r.id));
  });

  it('caps the count at the pool size (small pools still fill up)', () => {
    const recipes = [recipe(1, daysAgo(1)), recipe(2, daysAgo(1))];
    const { suggestions } = pickSuggestions(recipes, { count: 4, now, random: firstPick });

    expect(suggestions).toHaveLength(2);
  });

  it('returns nothing for an empty pool', () => {
    expect(pickSuggestions([], { count: 4, now })).toEqual({ suggestions: [], pool: [] });
  });

  it('never suggests the same recipe twice', () => {
    const recipes = [1, 2, 3, 4].map((id) => recipe(id, daysAgo(id)));
    const { suggestions } = pickSuggestions(recipes, { count: 4, now, random: () => 0.5 });

    expect(new Set(suggestions.map((r) => r.id)).size).toBe(4);
  });

  it('breaks staleness ties by plan count then id', () => {
    const { pool } = pickSuggestions(
      [recipe(3, daysAgo(5), 1), recipe(2, daysAgo(5), 9), recipe(1, daysAgo(5), 1)],
      { now, random: firstPick }
    );

    expect(pool.map((r) => r.id)).toEqual([1, 3, 2]);
  });
});
