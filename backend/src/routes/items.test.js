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

const createItem = (body) => request(app).post('/api/items').send(body);

describe('GET /api/items', () => {
  it('returns an empty list initially', async () => {
    const res = await request(app).get('/api/items');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('joins category information onto each item', async () => {
    await createItem({ name: 'Milk', category_id: 8 });
    const res = await request(app).get('/api/items');

    expect(res.body[0]).toMatchObject({
      name: 'Milk',
      category_id: 8,
      category_name: 'Dairy & Eggs',
      category_sort_order: 8,
    });
  });

  it('orders unchecked before checked, then by category, then position', async () => {
    insertItem({ name: 'checked', category_id: 1, checked: 1, position_in_list: 1 });
    insertItem({ name: 'later category', category_id: 3, position_in_list: 1 });
    insertItem({ name: 'first', category_id: 1, position_in_list: 2 });
    insertItem({ name: 'second', category_id: 1, position_in_list: 3 });

    const res = await request(app).get('/api/items');
    expect(res.body.map((i) => i.name)).toEqual([
      'first',
      'second',
      'later category',
      'checked',
    ]);
  });
});

describe('POST /api/items', () => {
  it('creates an item and returns 201 with the persisted row', async () => {
    const res = await createItem({ name: 'Bread', amount: '2', description: 'sourdough' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      name: 'Bread',
      amount: '2',
      description: 'sourdough',
      checked: 0,
    });
  });

  it('trims whitespace and normalizes blank optional fields to null', async () => {
    const res = await createItem({ name: '  Eggs  ', description: '   ', amount: '  ' });

    expect(res.body.name).toBe('Eggs');
    expect(res.body.description).toBeNull();
    expect(res.body.amount).toBeNull();
  });

  it('rejects a missing or blank name', async () => {
    for (const body of [{}, { name: '' }, { name: '   ' }]) {
      const res = await createItem(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Item name is required');
    }
  });

  it('appends each new item to the end of the list', async () => {
    const first = await createItem({ name: 'A' });
    const second = await createItem({ name: 'B' });

    expect(second.body.position_in_list).toBe(first.body.position_in_list + 1);
  });

  it('broadcasts item-created with the supplied changeId', async () => {
    const { events } = await captureEvents(() =>
      createItem({ name: 'Milk', changeId: 'change-1' })
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'item-created', changeId: 'change-1' });
    expect(events[0].data.name).toBe('Milk');
  });
});

describe('auto-categorization', () => {
  it('learns a category from an explicit assignment and reuses it', async () => {
    await createItem({ name: 'Milk', category_id: 8 });
    const res = await createItem({ name: 'Milk' });

    expect(res.body.category_id).toBe(8);
  });

  it('matches learned names case- and whitespace-insensitively', async () => {
    await createItem({ name: 'Milk', category_id: 8 });
    const res = await createItem({ name: '  mILk  ' });

    expect(res.body.category_id).toBe(8);
  });

  it('leaves the category null when nothing has been learned', async () => {
    const res = await createItem({ name: 'Unknown thing' });
    expect(res.body.category_id).toBeNull();
  });

  it('prefers an explicit category over a learned one', async () => {
    await createItem({ name: 'Milk', category_id: 8 });
    const res = await createItem({ name: 'Milk', category_id: 1 });

    expect(res.body.category_id).toBe(1);
  });

  it('exposes suggestions via GET /api/items/suggest-category', async () => {
    await createItem({ name: 'Milk', category_id: 8 });

    const hit = await request(app).get('/api/items/suggest-category?name=milk');
    expect(hit.body).toEqual({ category_id: 8 });

    const miss = await request(app).get('/api/items/suggest-category?name=nothing');
    expect(miss.body).toEqual({ category_id: null });

    const invalid = await request(app).get('/api/items/suggest-category');
    expect(invalid.status).toBe(400);
  });
});

describe('PUT /api/items/:id', () => {
  it('updates the editable fields', async () => {
    const { body: item } = await createItem({ name: 'Milk' });
    const res = await request(app)
      .put(`/api/items/${item.id}`)
      .send({ name: 'Oat milk', amount: '1L', category_id: 8 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Oat milk', amount: '1L', category_id: 8 });
  });

  it('404s for an unknown id', async () => {
    const res = await request(app).put('/api/items/9999').send({ name: 'Ghost' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Item not found');
  });

  it('rejects a blank name', async () => {
    const { body: item } = await createItem({ name: 'Milk' });
    const res = await request(app).put(`/api/items/${item.id}`).send({ name: '  ' });
    expect(res.status).toBe(400);
  });

  it('broadcasts item-updated', async () => {
    const { body: item } = await createItem({ name: 'Milk' });
    const { events } = await captureEvents(() =>
      request(app).put(`/api/items/${item.id}`).send({ name: 'Oat milk', changeId: 'c2' })
    );

    expect(events[0]).toMatchObject({ type: 'item-updated', changeId: 'c2' });
  });

  describe('when the item came from a recipe', () => {
    const createRecipeWithItem = async () => {
      const { body: recipe } = await request(app)
        .post('/api/recipes')
        .send({ name: 'Pancakes', ingredients: [{ name: 'Milk', category_id: 8 }] });
      const { body: added } = await request(app).post(`/api/recipes/${recipe.id}/add-to-list`).send({});
      return { recipe, item: added.items[0] };
    };

    it('mirrors the edit onto the recipe ingredient', async () => {
      const { recipe, item } = await createRecipeWithItem();

      await request(app)
        .put(`/api/items/${item.id}`)
        .send({ name: 'Oat milk', amount: '1L', category_id: 3 });

      const { body: updatedRecipe } = await request(app).get(`/api/recipes/${recipe.id}`);
      expect(updatedRecipe.ingredients[0]).toMatchObject({
        name: 'Oat milk',
        amount: '1L',
        category_id: 3,
      });
    });

    it('broadcasts recipe-updated alongside item-updated', async () => {
      const { item } = await createRecipeWithItem();
      const { events } = await captureEvents(() =>
        request(app).put(`/api/items/${item.id}`).send({ name: 'Milk', category_id: 3 })
      );

      expect(events.map((e) => e.type)).toEqual(['item-updated', 'recipe-updated']);
    });

    it('recategorises the same ingredient in every other recipe', async () => {
      const { item } = await createRecipeWithItem();
      const { body: other } = await request(app)
        .post('/api/recipes')
        .send({ name: 'Cereal', ingredients: [{ name: 'milk', category_id: 8 }, { name: 'Oats', category_id: 8 }] });

      await request(app).put(`/api/items/${item.id}`).send({ name: 'Milk', category_id: 3 });

      const { body: otherRecipe } = await request(app).get(`/api/recipes/${other.id}`);
      expect(otherRecipe.ingredients).toMatchObject([
        { name: 'milk', category_id: 3 },
        { name: 'Oats', category_id: 8 },
      ]);
    });

    it('leaves amounts in other recipes alone', async () => {
      const { item } = await createRecipeWithItem();
      const { body: other } = await request(app)
        .post('/api/recipes')
        .send({ name: 'Cereal', ingredients: [{ name: 'Milk', amount: '100ml', category_id: 8 }] });

      await request(app).put(`/api/items/${item.id}`).send({ name: 'Milk', amount: '2L', category_id: 3 });

      const { body: otherRecipe } = await request(app).get(`/api/recipes/${other.id}`);
      expect(otherRecipe.ingredients[0]).toMatchObject({ amount: '100ml', category_id: 3 });
    });

    it('recategorises duplicate list items with the same name', async () => {
      const { item } = await createRecipeWithItem();
      const { body: duplicate } = await createItem({ name: 'milk', amount: '500ml', category_id: 8 });

      await request(app).put(`/api/items/${item.id}`).send({ name: 'Milk', category_id: 3 });

      const { body: items } = await request(app).get('/api/items');
      expect(items.find((i) => i.id === duplicate.id)).toMatchObject({
        amount: '500ml',
        category_id: 3,
      });
    });
  });
});

describe('PATCH /api/items/:id/check', () => {
  it('marks an item checked', async () => {
    const { body: item } = await createItem({ name: 'Milk' });
    const res = await request(app).patch(`/api/items/${item.id}/check`).send({ checked: true });

    expect(res.status).toBe(200);
    expect(res.body.checked).toBe(1);
  });

  it('moves a checked item above the existing checked group in its category', async () => {
    const a = insertItem({ name: 'a', category_id: 1, checked: 1, position_in_list: 5 });
    const target = insertItem({ name: 'target', category_id: 1, position_in_list: 9 });

    const res = await request(app).patch(`/api/items/${target}/check`).send({ checked: true });

    expect(res.body.position_in_list).toBe(4); // min(5) - 1
    expect(a).toBeTypeOf('number');
  });

  it('moves an unchecked item below the existing unchecked group', async () => {
    insertItem({ name: 'a', category_id: 1, position_in_list: 3 });
    const target = insertItem({ name: 'target', category_id: 1, checked: 1, position_in_list: -1 });

    const res = await request(app).patch(`/api/items/${target}/check`).send({ checked: false });

    expect(res.body.checked).toBe(0);
    expect(res.body.position_in_list).toBe(4); // max(3) + 1
  });

  it('scopes repositioning to the item\'s own category', async () => {
    insertItem({ name: 'other category', category_id: 2, checked: 1, position_in_list: -50 });
    const target = insertItem({ name: 'target', category_id: 1, position_in_list: 4 });

    const res = await request(app).patch(`/api/items/${target}/check`).send({ checked: true });

    expect(res.body.position_in_list).toBe(-1); // unaffected by the other category
  });

  it('requires checked to be a boolean', async () => {
    const { body: item } = await createItem({ name: 'Milk' });
    const res = await request(app).patch(`/api/items/${item.id}/check`).send({ checked: 'yes' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('checked must be a boolean');
  });

  it('404s for an unknown id', async () => {
    const res = await request(app).patch('/api/items/9999/check').send({ checked: true });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/items/reorder', () => {
  it('applies new positions and returns the full list', async () => {
    const a = insertItem({ name: 'a', position_in_list: 1 });
    const b = insertItem({ name: 'b', position_in_list: 2 });

    const res = await request(app)
      .put('/api/items/reorder')
      .send({ items: [{ id: b, position_in_list: 1 }, { id: a, position_in_list: 2 }] });

    expect(res.status).toBe(200);
    expect(res.body.map((i) => i.name)).toEqual(['b', 'a']);
  });

  it('is not shadowed by the /:id route', async () => {
    const res = await request(app).put('/api/items/reorder').send({ items: [] });
    expect(res.status).toBe(200);
  });

  it('rejects a non-array payload', async () => {
    const res = await request(app).put('/api/items/reorder').send({ items: 'nope' });
    expect(res.status).toBe(400);
  });

  it('rejects entries missing an id or position, rolling back the whole batch', async () => {
    const a = insertItem({ name: 'a', position_in_list: 1 });

    const res = await request(app)
      .put('/api/items/reorder')
      .send({ items: [{ id: a, position_in_list: 7 }, { id: null, position_in_list: null }] });

    expect(res.status).toBe(400);

    const row = getDatabase().prepare('SELECT position_in_list FROM items WHERE id = ?').get(a);
    expect(row.position_in_list).toBe(1); // the valid update was rolled back too
  });
});

describe('DELETE /api/items/checked', () => {
  it('deletes every checked item when no ids are given', async () => {
    insertItem({ name: 'checked', checked: 1 });
    insertItem({ name: 'unchecked' });

    const res = await request(app).delete('/api/items/checked').send({});

    expect(res.body.deletedCount).toBe(1);
    const remaining = await request(app).get('/api/items');
    expect(remaining.body.map((i) => i.name)).toEqual(['unchecked']);
  });

  it('only deletes the ids it was given, protecting concurrent checks', async () => {
    const mine = insertItem({ name: 'mine', checked: 1 });
    insertItem({ name: 'checked by someone else', checked: 1 });

    const res = await request(app).delete('/api/items/checked').send({ ids: [mine] });

    expect(res.body.deletedCount).toBe(1);
    const remaining = await request(app).get('/api/items');
    expect(remaining.body.map((i) => i.name)).toEqual(['checked by someone else']);
  });

  it('never deletes an unchecked item even if its id is supplied', async () => {
    const unchecked = insertItem({ name: 'unchecked' });

    const res = await request(app).delete('/api/items/checked').send({ ids: [unchecked] });

    expect(res.body.deletedCount).toBe(0);
    const remaining = await request(app).get('/api/items');
    expect(remaining.body).toHaveLength(1);
  });

  it('handles an empty ids array as a no-op', async () => {
    insertItem({ name: 'checked', checked: 1 });

    const res = await request(app).delete('/api/items/checked').send({ ids: [] });

    expect(res.body.deletedCount).toBe(0);
    expect((await request(app).get('/api/items')).body).toHaveLength(1);
  });

  it('broadcasts the deleted ids so clients can prune locally', async () => {
    const id = insertItem({ name: 'checked', checked: 1 });

    const { events } = await captureEvents(() =>
      request(app).delete('/api/items/checked').send({ changeId: 'c3' })
    );

    expect(events[0]).toMatchObject({
      type: 'items-deleted-checked',
      data: { ids: [id] },
      changeId: 'c3',
    });
  });
});

describe('DELETE /api/items/:id', () => {
  it('deletes the item and returns 204', async () => {
    const { body: item } = await createItem({ name: 'Milk' });
    const res = await request(app).delete(`/api/items/${item.id}`);

    expect(res.status).toBe(204);
    expect((await request(app).get('/api/items')).body).toEqual([]);
  });

  it('404s for an unknown id', async () => {
    const res = await request(app).delete('/api/items/9999');
    expect(res.status).toBe(404);
  });

  it('broadcasts item-deleted with a numeric id', async () => {
    const { body: item } = await createItem({ name: 'Milk' });
    const { events } = await captureEvents(() => request(app).delete(`/api/items/${item.id}`));

    expect(events[0]).toMatchObject({ type: 'item-deleted', data: { id: item.id } });
    expect(typeof events[0].data.id).toBe('number');
  });
});

describe('duplicate grouping', () => {
  it('places a case- and plural-insensitive duplicate right after the original', async () => {
    await createItem({ name: 'Tomato', category_id: 1 });
    await createItem({ name: 'Bread', category_id: 1 });
    await createItem({ name: 'tomatoes', category_id: 1 });

    const res = await request(app).get('/api/items');
    expect(res.body.map((i) => i.name)).toEqual(['Tomato', 'tomatoes', 'Bread']);
  });

  it('adopts the category of the existing duplicate when none is given', async () => {
    await createItem({ name: 'Berry', category_id: 3 });
    const res = await createItem({ name: 'berries' });

    expect(res.body.category_id).toBe(3);
  });

  it('ignores checked duplicates', async () => {
    insertItem({ name: 'Milk', category_id: 1, checked: 1, position_in_list: 1 });
    const res = await createItem({ name: 'milk', category_id: 1 });

    expect(res.body.position_in_list).toBe(2);
  });
});
