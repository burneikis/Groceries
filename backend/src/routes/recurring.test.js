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

const create = (body) => request(app).post('/api/recurring').send(body);

describe('GET /api/recurring', () => {
  it('lists recurring items in category order, then by name, uncategorised last', async () => {
    // Seeded categories: 1 = Fruit & Vegetables ... 8 = Dairy & Eggs
    await create({ name: 'Yoghurt', category_id: 8 });
    await create({ name: 'Cheese', category_id: 8 });
    await create({ name: 'Bananas', category_id: 1 });
    await create({ name: 'Zzz mystery' });

    const res = await request(app).get('/api/recurring');

    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.name)).toEqual(['Bananas', 'Cheese', 'Yoghurt', 'Zzz mystery']);
    expect(res.body[0].category_name).toBeTruthy();
  });
});

describe('POST /api/recurring', () => {
  it('creates a recurring item and broadcasts it', async () => {
    const { result: res, events } = await captureEvents(() =>
      create({ name: '  Milk ', amount: ' 2L ', category_id: 8, changeId: 'c1' })
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Milk', amount: '2L', category_id: 8 });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'recurring-created', changeId: 'c1' })
    );
  });

  it('requires a name', async () => {
    expect((await create({ name: '  ' })).status).toBe(400);
  });

  it('rejects a name that matches an existing one, ignoring case and plurals', async () => {
    await create({ name: 'Egg' });

    const res = await create({ name: 'EGGS' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already a recurring item/);
  });

  it('suggests a category from what it has learned', async () => {
    getDatabase()
      .prepare('INSERT INTO item_category_mappings (item_name_lower, category_id) VALUES (?, ?)')
      .run('bread', 5);

    const res = await create({ name: 'Bread' });

    expect(res.body.category_id).toBe(5);
  });

  it('shares an explicit category with same-named list items and recipes', async () => {
    const itemId = insertItem({ name: 'milk', category_id: 1 });

    const { events } = await captureEvents(() => create({ name: 'Milk', category_id: 8 }));

    const item = getDatabase().prepare('SELECT category_id FROM items WHERE id = ?').get(itemId);
    expect(item.category_id).toBe(8);
    expect(events.map((e) => e.type)).toContain('item-updated');
  });
});

describe('PUT /api/recurring/:id', () => {
  it('updates the item', async () => {
    const { body: milk } = await create({ name: 'Milk' });

    const res = await request(app)
      .put(`/api/recurring/${milk.id}`)
      .send({ name: 'Milk', amount: '1L', category_id: 8 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ amount: '1L', category_id: 8 });
  });

  it('allows keeping its own name but not taking another one', async () => {
    const { body: milk } = await create({ name: 'Milk' });
    await create({ name: 'Bread' });

    expect((await request(app).put(`/api/recurring/${milk.id}`).send({ name: 'milk' })).status).toBe(200);
    expect((await request(app).put(`/api/recurring/${milk.id}`).send({ name: 'Breads' })).status).toBe(409);
  });

  it('404s for an unknown id', async () => {
    const res = await request(app).put('/api/recurring/999').send({ name: 'Milk' });
    expect(res.status).toBe(404);
  });

  it('propagates its category to recipes', async () => {
    const { body: recipe } = await request(app)
      .post('/api/recipes')
      .send({ name: 'Pancakes', ingredients: [{ name: 'Milk', category_id: 1 }] });
    const { body: milk } = await create({ name: 'Milk' });

    const { events } = await captureEvents(() =>
      request(app).put(`/api/recurring/${milk.id}`).send({ name: 'Milk', category_id: 8 })
    );

    const updated = (await request(app).get(`/api/recipes/${recipe.id}`)).body;
    expect(updated.ingredients[0].category_id).toBe(8);
    expect(events.map((e) => e.type)).toContain('recipe-updated');
  });
});

describe('category sync into recurring items', () => {
  it('follows a recategorised list item', async () => {
    const { body: milk } = await create({ name: 'Milk', category_id: 1 });
    const itemId = insertItem({ name: 'Milk', category_id: 1 });

    const { events } = await captureEvents(() =>
      request(app).put(`/api/items/${itemId}`).send({ name: 'Milk', category_id: 8 })
    );

    const [recurring] = (await request(app).get('/api/recurring')).body;
    expect(recurring).toMatchObject({ id: milk.id, category_id: 8 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'recurring-updated' }));
  });

  it('follows a recategorised recipe ingredient', async () => {
    await create({ name: 'Milk', category_id: 1 });
    const { body: recipe } = await request(app)
      .post('/api/recipes')
      .send({ name: 'Pancakes', ingredients: [{ name: 'Milk', category_id: 1 }] });

    const { events } = await captureEvents(() =>
      request(app)
        .put(`/api/recipes/${recipe.id}`)
        .send({ name: 'Pancakes', ingredients: [{ name: 'Milk', category_id: 8 }] })
    );

    const [recurring] = (await request(app).get('/api/recurring')).body;
    expect(recurring.category_id).toBe(8);
    expect(events).toContainEqual(expect.objectContaining({ type: 'recurring-updated' }));
  });
});

describe('DELETE /api/recurring/:id', () => {
  it('deletes the item and broadcasts it', async () => {
    const { body: milk } = await create({ name: 'Milk' });

    const { result: res, events } = await captureEvents(() =>
      request(app).delete(`/api/recurring/${milk.id}`)
    );

    expect(res.status).toBe(204);
    expect((await request(app).get('/api/recurring')).body).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'recurring-deleted', data: { id: milk.id } })
    );
  });

  it('404s for an unknown id', async () => {
    expect((await request(app).delete('/api/recurring/999')).status).toBe(404);
  });
});
