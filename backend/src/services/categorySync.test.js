import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '../db/database.js';
import { seedCategories } from '../db/seed.js';
import {
  propagateCategory,
  propagateCategoryToItems,
  propagateCategoryToRecipes,
} from './categorySync.js';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  closeDatabase();
  initializeDatabase(':memory:');
  seedCategories();
});

afterEach(() => {
  closeDatabase();
  vi.restoreAllMocks();
});

const addItem = (name, categoryId, amount = null) =>
  Number(
    getDatabase()
      .prepare('INSERT INTO items (name, category_id, amount) VALUES (?, ?, ?)')
      .run(name, categoryId, amount).lastInsertRowid
  );

const addRecipe = (name, ingredients) => {
  const db = getDatabase();
  const recipeId = Number(db.prepare('INSERT INTO recipes (name) VALUES (?)').run(name).lastInsertRowid);
  const insert = db.prepare(
    'INSERT INTO recipe_ingredients (recipe_id, name, category_id, amount) VALUES (?, ?, ?, ?)'
  );
  ingredients.forEach((ing) => insert.run(recipeId, ing.name, ing.category_id, ing.amount ?? null));
  return recipeId;
};

const itemRow = (id) => getDatabase().prepare('SELECT * FROM items WHERE id = ?').get(id);
const ingredientRows = (recipeId) =>
  getDatabase().prepare('SELECT * FROM recipe_ingredients WHERE recipe_id = ?').all(recipeId);

describe('propagateCategoryToItems', () => {
  it('recategorises same-named items, ignoring case', () => {
    const a = addItem('Milk', 8);
    const b = addItem('milk', 8);

    expect(propagateCategoryToItems(getDatabase(), 'MILK', 3)).toEqual([a, b]);
    expect(itemRow(a).category_id).toBe(3);
    expect(itemRow(b).category_id).toBe(3);
  });

  it('skips the excluded item and rows that already match', () => {
    const edited = addItem('Milk', 3);
    const stale = addItem('Milk', 8);
    const settled = addItem('Milk', 3);

    expect(propagateCategoryToItems(getDatabase(), 'Milk', 3, edited)).toEqual([stale]);
    expect(itemRow(settled).category_id).toBe(3);
  });

  it('accepts a string id for the exclusion, as routes supply', () => {
    const edited = addItem('Milk', 3);
    expect(propagateCategoryToItems(getDatabase(), 'Milk', 3, String(edited))).toEqual([]);
  });

  it('leaves other names and their amounts untouched', () => {
    const other = addItem('Bread', 8);
    const milk = addItem('Milk', 8, '500ml');

    propagateCategoryToItems(getDatabase(), 'Milk', 3);

    expect(itemRow(other).category_id).toBe(8);
    expect(itemRow(milk).amount).toBe('500ml');
  });

  it('can clear a category', () => {
    const id = addItem('Milk', 8);
    expect(propagateCategoryToItems(getDatabase(), 'Milk', null)).toEqual([id]);
    expect(itemRow(id).category_id).toBeNull();
  });
});

describe('propagateCategoryToRecipes', () => {
  it('updates the ingredient in every other recipe', () => {
    const pancakes = addRecipe('Pancakes', [{ name: 'Milk', category_id: 8 }]);
    const cereal = addRecipe('Cereal', [
      { name: 'milk', category_id: 8, amount: '100ml' },
      { name: 'Oats', category_id: 8 },
    ]);

    expect(propagateCategoryToRecipes(getDatabase(), 'Milk', 3, pancakes)).toEqual([cereal]);
    expect(ingredientRows(cereal)).toMatchObject([
      { name: 'milk', category_id: 3, amount: '100ml' },
      { name: 'Oats', category_id: 8 },
    ]);
    expect(ingredientRows(pancakes)[0].category_id).toBe(8);
  });

  it('reports nothing when every recipe already agrees', () => {
    addRecipe('Cereal', [{ name: 'Milk', category_id: 3 }]);
    expect(propagateCategoryToRecipes(getDatabase(), 'Milk', 3)).toEqual([]);
  });
});

describe('propagateCategory', () => {
  it('fans out to items and recipes at once', () => {
    const item = addItem('Milk', 8);
    const recipe = addRecipe('Cereal', [{ name: 'Milk', category_id: 8 }]);

    expect(propagateCategory(getDatabase(), { name: 'Milk', categoryId: 3 })).toEqual({
      itemIds: [item],
      recipeIds: [recipe],
    });
  });
});
