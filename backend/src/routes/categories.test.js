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

describe('GET /api/categories', () => {
  it('returns the seeded defaults in sort order', async () => {
    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(10);
    expect(res.body[0].name).toBe('Fruit & Vegetables');
    expect(res.body.map((c) => c.sort_order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('POST /api/categories', () => {
  it('appends the new category to the end of the order', async () => {
    const res = await request(app).post('/api/categories').send({ name: 'Pet Supplies' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Pet Supplies', sort_order: 11 });
  });

  it('trims the name', async () => {
    const res = await request(app).post('/api/categories').send({ name: '  Spices  ' });
    expect(res.body.name).toBe('Spices');
  });

  it('rejects a blank name', async () => {
    for (const body of [{}, { name: '' }, { name: '   ' }]) {
      const res = await request(app).post('/api/categories').send(body);
      expect(res.status).toBe(400);
    }
  });

  it('409s on a duplicate name', async () => {
    const res = await request(app).post('/api/categories').send({ name: 'Bakery' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('That name already exists');
  });

  it('broadcasts category-created', async () => {
    const { events } = await captureEvents(() =>
      request(app).post('/api/categories').send({ name: 'Spices', changeId: 'c1' })
    );

    expect(events[0]).toMatchObject({ type: 'category-created', changeId: 'c1' });
  });
});

describe('PUT /api/categories/:id', () => {
  it('renames a category', async () => {
    const res = await request(app).put('/api/categories/1').send({ name: 'Produce' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: 'Produce' });
  });

  it('404s for an unknown id', async () => {
    const res = await request(app).put('/api/categories/9999').send({ name: 'Nope' });
    expect(res.status).toBe(404);
  });

  it('rejects a blank name', async () => {
    const res = await request(app).put('/api/categories/1').send({ name: '  ' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/categories/reorder', () => {
  it('applies the supplied sort orders', async () => {
    const res = await request(app)
      .put('/api/categories/reorder')
      .send({ categories: [{ id: 3, sort_order: 1 }, { id: 1, sort_order: 3 }] });

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: 3, sort_order: 1 });
  });

  it('is not shadowed by the /:id route', async () => {
    const res = await request(app).put('/api/categories/reorder').send({ categories: [] });
    expect(res.status).toBe(200);
  });

  it('rejects a non-array payload', async () => {
    const res = await request(app).put('/api/categories/reorder').send({ categories: {} });
    expect(res.status).toBe(400);
  });

  it('rolls the whole batch back when an entry is malformed', async () => {
    const res = await request(app)
      .put('/api/categories/reorder')
      .send({ categories: [{ id: 1, sort_order: 99 }, { id: 2 }] });

    expect(res.status).toBe(400);

    const row = getDatabase().prepare('SELECT sort_order FROM categories WHERE id = 1').get();
    expect(row.sort_order).toBe(1); // valid update rolled back with the invalid one
  });
});

describe('DELETE /api/categories/:id', () => {
  it('deletes the category and returns 204', async () => {
    const res = await request(app).delete('/api/categories/10');

    expect(res.status).toBe(204);
    expect((await request(app).get('/api/categories')).body).toHaveLength(9);
  });

  it('404s for an unknown id', async () => {
    const res = await request(app).delete('/api/categories/9999');
    expect(res.status).toBe(404);
  });

  it('detaches items instead of deleting them', async () => {
    const id = insertItem({ name: 'Milk', category_id: 8 });

    await request(app).delete('/api/categories/8');

    const items = (await request(app).get('/api/items')).body;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id, name: 'Milk', category_id: null });
  });

  it('detaches recipe ingredients that referenced it', async () => {
    const { body: recipe } = await request(app)
      .post('/api/recipes')
      .send({ name: 'Omelette', ingredients: [{ name: 'Eggs', category_id: 8 }] });

    await request(app).delete('/api/categories/8');

    const res = await request(app).get(`/api/recipes/${recipe.id}`);
    expect(res.body.ingredients[0].category_id).toBeNull();
  });

  it('forgets learned mappings pointing at the category', async () => {
    await request(app).post('/api/items').send({ name: 'Milk', category_id: 8 });
    await request(app).delete('/api/categories/8');

    const res = await request(app).get('/api/items/suggest-category?name=Milk');
    expect(res.body.category_id).toBeNull();
  });

  it('broadcasts category-deleted with a numeric id', async () => {
    const { events } = await captureEvents(() => request(app).delete('/api/categories/10'));

    expect(events[0]).toMatchObject({ type: 'category-deleted', data: { id: 10 } });
  });
});
