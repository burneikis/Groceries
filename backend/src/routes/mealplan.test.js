import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureEvents,
  createTestApp,
  destroyTestApp,
  getDatabase,
  insertItem,
  silenceConsole,
} from '../test/helpers.js';

let app;

beforeEach(() => {
  silenceConsole();
  app = createTestApp();
});

afterEach(() => {
  destroyTestApp();
  vi.restoreAllMocks();
});

/** Create a recipe directly, optionally marked regular / previously planned. */
function seedRecipe({ name, isRegular = true, lastPlannedAt = null, ingredients = ['Thing'] }) {
  const db = getDatabase();
  const { lastInsertRowid } = db
    .prepare('INSERT INTO recipes (name, is_regular, last_planned_at) VALUES (?, ?, ?)')
    .run(name, isRegular ? 1 : 0, lastPlannedAt);

  const id = Number(lastInsertRowid);
  ingredients.forEach((ing, i) => {
    db.prepare(
      'INSERT INTO recipe_ingredients (recipe_id, name, position) VALUES (?, ?, ?)'
    ).run(id, ing, i);
  });
  return id;
}

/** Create a recurring item directly. */
function seedRecurring(name, amount = null) {
  return Number(
    getDatabase()
      .prepare('INSERT INTO recurring_items (name, amount) VALUES (?, ?)')
      .run(name, amount).lastInsertRowid
  );
}

describe('GET /api/mealplan/suggestions', () => {
  it('suggests regular recipes with their ingredients', async () => {
    seedRecipe({ name: 'Chilli' });
    seedRecipe({ name: 'Curry', ingredients: ['Rice', 'Sauce'] });

    const res = await request(app).get('/api/mealplan/suggestions');

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toHaveLength(2);
    expect(res.body.pool).toHaveLength(2);
    const curry = res.body.pool.find((r) => r.name === 'Curry');
    expect(curry.ingredients).toHaveLength(2);
  });

  it('ignores recipes that are not regular', async () => {
    seedRecipe({ name: 'Regular' });
    seedRecipe({ name: 'One-off', isRegular: false });

    const res = await request(app).get('/api/mealplan/suggestions');

    expect(res.body.pool.map((r) => r.name)).toEqual(['Regular']);
  });

  it('excludes recipes already on the list', async () => {
    const onList = seedRecipe({ name: 'Already' });
    seedRecipe({ name: 'Free' });
    insertItem({ name: 'Thing', recipe_id: onList });

    const res = await request(app).get('/api/mealplan/suggestions');

    expect(res.body.pool.map((r) => r.name)).toEqual(['Free']);
  });

  it('honours the count parameter', async () => {
    ['A', 'B', 'C'].forEach((name) => seedRecipe({ name }));

    const res = await request(app).get('/api/mealplan/suggestions?count=2');

    expect(res.body.suggestions).toHaveLength(2);
    expect(res.body.pool).toHaveLength(3);
  });

  it('rejects a nonsensical count', async () => {
    const res = await request(app).get('/api/mealplan/suggestions?count=0');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/mealplan/confirm', () => {
  it('adds every recipe\'s ingredients and stamps the plan', async () => {
    const a = seedRecipe({ name: 'Chilli', ingredients: ['Beans', 'Mince'] });
    const b = seedRecipe({ name: 'Curry', ingredients: ['Rice'] });

    const { result: res, events } = await captureEvents(() =>
      request(app).post('/api/mealplan/confirm').send({ recipeIds: [a, b] })
    );

    expect(res.status).toBe(201);
    expect(res.body.itemsAdded).toBe(3);
    expect(events.filter((e) => e.type === 'item-created')).toHaveLength(3);
    expect(events.filter((e) => e.type === 'recipe-updated')).toHaveLength(2);

    const db = getDatabase();
    expect(db.prepare('SELECT COUNT(*) as n FROM recipe_plan_history').get().n).toBe(2);
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(a);
    expect(recipe.plan_count).toBe(1);
    expect(recipe.last_planned_at).toBeTruthy();
  });

  it('can skip individual ingredients', async () => {
    const id = seedRecipe({ name: 'Chilli', ingredients: ['Beans', 'Mince'] });
    const beans = getDatabase()
      .prepare('SELECT id FROM recipe_ingredients WHERE recipe_id = ? AND name = ?')
      .get(id, 'Beans');

    const res = await request(app)
      .post('/api/mealplan/confirm')
      .send({ recipeIds: [id], excludedIngredientIds: [beans.id] });

    expect(res.body.itemsAdded).toBe(1);
    expect(res.body.items[0].name).toBe('Mince');
  });

  it('rolls back entirely when a recipe id is unknown', async () => {
    const good = seedRecipe({ name: 'Chilli' });

    const res = await request(app).post('/api/mealplan/confirm').send({ recipeIds: [good, 999] });

    expect(res.status).toBe(404);
    const db = getDatabase();
    expect(db.prepare('SELECT COUNT(*) as n FROM items').get().n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) as n FROM recipe_plan_history').get().n).toBe(0);
  });

  it('adds chosen recurring items marked as recurring', async () => {
    const recipe = seedRecipe({ name: 'Chilli', ingredients: ['Beans'] });
    const milk = seedRecurring('Milk', '2L');
    seedRecurring('Bread');

    const res = await request(app)
      .post('/api/mealplan/confirm')
      .send({ recipeIds: [recipe], recurringItemIds: [milk] });

    expect(res.status).toBe(201);
    expect(res.body.itemsAdded).toBe(2);
    const added = res.body.items.find((i) => i.name === 'Milk');
    expect(added).toMatchObject({ amount: '2L', is_recurring: 1, recipe_id: null });
    expect(res.body.items.find((i) => i.name === 'Beans').is_recurring).toBe(0);
  });

  it('places a recurring item next to an unchecked duplicate', async () => {
    const recipe = seedRecipe({ name: 'Chilli', ingredients: ['Beans'] });
    insertItem({ name: 'Milk', position_in_list: 5 });
    const milk = seedRecurring('milk');

    const res = await request(app)
      .post('/api/mealplan/confirm')
      .send({ recipeIds: [recipe], recurringItemIds: [milk] });

    expect(res.body.items.find((i) => i.name === 'milk').position_in_list).toBe(5);
  });

  it('skips recurring items that no longer exist', async () => {
    const recipe = seedRecipe({ name: 'Chilli', ingredients: ['Beans'] });

    const res = await request(app)
      .post('/api/mealplan/confirm')
      .send({ recipeIds: [recipe], recurringItemIds: [999] });

    expect(res.status).toBe(201);
    expect(res.body.itemsAdded).toBe(1);
  });

  it('still requires at least one dinner', async () => {
    const milk = seedRecurring('Milk');
    const res = await request(app)
      .post('/api/mealplan/confirm')
      .send({ recipeIds: [], recurringItemIds: [milk] });
    expect(res.status).toBe(400);
  });

  it('rejects non-numeric recurring ids', async () => {
    const recipe = seedRecipe({ name: 'Chilli' });
    const res = await request(app)
      .post('/api/mealplan/confirm')
      .send({ recipeIds: [recipe], recurringItemIds: ['abc'] });
    expect(res.status).toBe(400);
  });

  it('rejects an empty selection', async () => {
    const res = await request(app).post('/api/mealplan/confirm').send({ recipeIds: [] });
    expect(res.status).toBe(400);
  });
});
