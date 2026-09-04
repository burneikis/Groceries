import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureEvents,
  createTestApp,
  destroyTestApp,
  getDatabase,
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

const createRecipe = (body) => request(app).post('/api/recipes').send(body);

const pancakes = {
  name: 'Pancakes',
  ingredients: [
    { name: 'Flour', amount: '200g' },
    { name: 'Eggs', amount: '2', category_id: 8 },
  ],
};

describe('POST /api/recipes', () => {
  it('creates a recipe with its ingredients', async () => {
    const res = await createRecipe(pancakes);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: expect.any(Number), name: 'Pancakes' });
    expect(res.body.ingredients).toHaveLength(2);
    expect(res.body.ingredients[0]).toMatchObject({ name: 'Flour', amount: '200g', position: 0 });
  });

  it('creates a recipe with no ingredients', async () => {
    const res = await createRecipe({ name: 'Empty' });

    expect(res.status).toBe(201);
    expect(res.body.ingredients).toEqual([]);
  });

  it('rejects a blank recipe name', async () => {
    for (const body of [{}, { name: '   ' }]) {
      const res = await createRecipe(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Recipe name is required');
    }
  });

  it('rejects an ingredient without a name and saves nothing', async () => {
    const res = await createRecipe({ name: 'Broken', ingredients: [{ name: '  ' }] });

    expect(res.status).toBe(400);
    expect((await request(app).get('/api/recipes')).body).toEqual([]);
  });

  it('auto-categorizes ingredients from learned mappings', async () => {
    await request(app).post('/api/items').send({ name: 'Milk', category_id: 8 });

    const res = await createRecipe({ name: 'Cereal', ingredients: [{ name: 'Milk' }] });

    expect(res.body.ingredients[0].category_id).toBe(8);
  });

  it('preserves ingredient order via position', async () => {
    const res = await createRecipe({
      name: 'Ordered',
      ingredients: [{ name: 'first' }, { name: 'second' }, { name: 'third' }],
    });

    expect(res.body.ingredients.map((i) => i.name)).toEqual(['first', 'second', 'third']);
    expect(res.body.ingredients.map((i) => i.position)).toEqual([0, 1, 2]);
  });

  it('broadcasts recipe-created', async () => {
    const { events } = await captureEvents(() => createRecipe({ ...pancakes, changeId: 'c1' }));
    expect(events[0]).toMatchObject({ type: 'recipe-created', changeId: 'c1' });
  });
});

describe('GET /api/recipes', () => {
  it('lists recipes alphabetically without ingredients', async () => {
    await createRecipe({ name: 'Zucchini bake' });
    await createRecipe({ name: 'Apple pie' });

    const res = await request(app).get('/api/recipes');

    expect(res.body.map((r) => r.name)).toEqual(['Apple pie', 'Zucchini bake']);
    expect(res.body[0].ingredients).toBeUndefined();
  });

  it('returns a single recipe with ingredients and their category names', async () => {
    const { body: created } = await createRecipe(pancakes);
    const res = await request(app).get(`/api/recipes/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body.ingredients[1]).toMatchObject({
      name: 'Eggs',
      category_id: 8,
      category_name: 'Dairy & Eggs',
    });
  });

  it('404s for an unknown recipe', async () => {
    const res = await request(app).get('/api/recipes/9999');
    expect(res.status).toBe(404);
  });
});

describe('regular dinners', () => {
  it('persists is_regular via PUT and leaves it alone when omitted', async () => {
    const { body: created } = await createRecipe(pancakes);
    expect(created.is_regular).toBe(0);

    const marked = await request(app)
      .put(`/api/recipes/${created.id}`)
      .send({ name: 'Pancakes', ingredients: [], is_regular: true });
    expect(marked.body.is_regular).toBe(1);

    const renamed = await request(app)
      .put(`/api/recipes/${created.id}`)
      .send({ name: 'Crepes', ingredients: [] });
    expect(renamed.body.is_regular).toBe(1);
  });

  it('toggles is_regular via PATCH and emits recipe-updated', async () => {
    const { body: created } = await createRecipe(pancakes);

    const { result: res, events } = await captureEvents(() =>
      request(app).patch(`/api/recipes/${created.id}/regular`).send({ is_regular: true })
    );

    expect(res.status).toBe(200);
    expect(res.body.is_regular).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'recipe-updated', data: expect.objectContaining({ is_regular: 1 }) })
    );

    const off = await request(app)
      .patch(`/api/recipes/${created.id}/regular`)
      .send({ is_regular: false });
    expect(off.body.is_regular).toBe(0);
  });

  it('rejects a non-boolean value and an unknown recipe', async () => {
    const { body: created } = await createRecipe(pancakes);

    const bad = await request(app).patch(`/api/recipes/${created.id}/regular`).send({});
    expect(bad.status).toBe(400);

    const missing = await request(app).patch('/api/recipes/999/regular').send({ is_regular: true });
    expect(missing.status).toBe(404);
  });
});

describe('PUT /api/recipes/:id', () => {
  it('renames a recipe and replaces its ingredients wholesale', async () => {
    const { body: created } = await createRecipe(pancakes);

    const res = await request(app)
      .put(`/api/recipes/${created.id}`)
      .send({ name: 'Crepes', ingredients: [{ name: 'Butter' }] });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Crepes');
    expect(res.body.ingredients.map((i) => i.name)).toEqual(['Butter']);
  });

  it('can clear all ingredients', async () => {
    const { body: created } = await createRecipe(pancakes);

    const res = await request(app)
      .put(`/api/recipes/${created.id}`)
      .send({ name: 'Pancakes', ingredients: [] });

    expect(res.body.ingredients).toEqual([]);
  });

  it('404s for an unknown recipe', async () => {
    const res = await request(app).put('/api/recipes/9999').send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('leaves the original ingredients intact when the update is invalid', async () => {
    const { body: created } = await createRecipe(pancakes);

    const res = await request(app)
      .put(`/api/recipes/${created.id}`)
      .send({ name: 'Pancakes', ingredients: [{ name: 'Valid' }, { name: '  ' }] });

    expect(res.status).toBe(400);

    const after = await request(app).get(`/api/recipes/${created.id}`);
    expect(after.body.ingredients.map((i) => i.name)).toEqual(['Flour', 'Eggs']);
  });

  describe('when the recipe is already on the list', () => {
    const addToList = async () => {
      const { body: created } = await createRecipe(pancakes);
      const { body: added } = await request(app).post(`/api/recipes/${created.id}/add-to-list`).send({});
      return { recipe: created, items: added.items };
    };

    it('pushes ingredient edits onto the matching list items', async () => {
      const { recipe } = await addToList();

      await request(app).put(`/api/recipes/${recipe.id}`).send({
        name: 'Pancakes',
        ingredients: [{ name: 'Flour', amount: '500g', category_id: 3 }, { name: 'Eggs' }],
      });

      const { body: items } = await request(app).get('/api/items');
      expect(items.find((i) => i.name === 'Flour')).toMatchObject({ amount: '500g', category_id: 3 });
    });

    it('leaves items whose ingredient was renamed or removed alone', async () => {
      const { recipe } = await addToList();

      await request(app)
        .put(`/api/recipes/${recipe.id}`)
        .send({ name: 'Pancakes', ingredients: [{ name: 'Butter' }] });

      const { body: items } = await request(app).get('/api/items');
      expect(items.map((i) => i.name).sort()).toEqual(['Eggs', 'Flour']);
    });

    it('broadcasts item-updated for each synced item', async () => {
      const { recipe } = await addToList();

      const { events } = await captureEvents(() =>
        request(app).put(`/api/recipes/${recipe.id}`).send({
          name: 'Pancakes',
          ingredients: [{ name: 'Flour', category_id: 3 }, { name: 'Eggs' }],
          changeId: 'r1',
        })
      );

      expect(events.map((e) => e.type)).toEqual(['recipe-updated', 'item-updated', 'item-updated']);
    });
  });

  it('shares an ingredient category with other recipes and loose list items', async () => {
    const { body: created } = await createRecipe(pancakes);
    const { body: other } = await createRecipe({
      name: 'Bread',
      ingredients: [{ name: 'flour', amount: '1kg', category_id: 8 }],
    });
    const { body: loose } = await request(app).post('/api/items').send({ name: 'Flour', category_id: 8 });

    await request(app)
      .put(`/api/recipes/${created.id}`)
      .send({ name: 'Pancakes', ingredients: [{ name: 'Flour', category_id: 3 }] });

    const { body: otherRecipe } = await request(app).get(`/api/recipes/${other.id}`);
    expect(otherRecipe.ingredients[0]).toMatchObject({ amount: '1kg', category_id: 3 });

    const { body: items } = await request(app).get('/api/items');
    expect(items.find((i) => i.id === loose.id).category_id).toBe(3);
  });
});

describe('DELETE /api/recipes/:id', () => {
  it('deletes the recipe and cascades to its ingredients', async () => {
    const { body: created } = await createRecipe(pancakes);

    const res = await request(app).delete(`/api/recipes/${created.id}`);
    expect(res.status).toBe(204);

    const orphans = getDatabase()
      .prepare('SELECT COUNT(*) as count FROM recipe_ingredients WHERE recipe_id = ?')
      .get(created.id);
    expect(orphans.count).toBe(0);
  });

  it('404s for an unknown recipe', async () => {
    const res = await request(app).delete('/api/recipes/9999');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/recipes/:id/add-to-list', () => {
  it('adds every ingredient as an item tagged with the recipe', async () => {
    const { body: created } = await createRecipe(pancakes);

    const res = await request(app).post(`/api/recipes/${created.id}/add-to-list`).send({});

    expect(res.status).toBe(201);
    expect(res.body.itemsAdded).toBe(2);
    expect(res.body.items.map((i) => i.name)).toEqual(['Flour', 'Eggs']);
    expect(res.body.items.every((i) => i.recipe_id === created.id)).toBe(true);
    expect(res.body.items.every((i) => i.recipe_name === 'Pancakes')).toBe(true);
  });

  it('carries the ingredient amount and category onto the item', async () => {
    const { body: created } = await createRecipe(pancakes);
    const res = await request(app).post(`/api/recipes/${created.id}/add-to-list`).send({});

    expect(res.body.items[1]).toMatchObject({ name: 'Eggs', amount: '2', category_id: 8 });
  });

  it('appends after existing items rather than reusing positions', async () => {
    await request(app).post('/api/items').send({ name: 'Existing' });
    const { body: created } = await createRecipe(pancakes);

    const res = await request(app).post(`/api/recipes/${created.id}/add-to-list`).send({});

    expect(res.body.items.map((i) => i.position_in_list)).toEqual([2, 3]);
  });

  it('404s for a recipe with no ingredients', async () => {
    const { body: created } = await createRecipe({ name: 'Empty' });
    const res = await request(app).post(`/api/recipes/${created.id}/add-to-list`).send({});

    expect(res.status).toBe(404);
  });

  it('broadcasts an item-created event per ingredient', async () => {
    const { body: created } = await createRecipe(pancakes);

    const { events } = await captureEvents(() =>
      request(app).post(`/api/recipes/${created.id}/add-to-list`).send({ changeId: 'c2' })
    );

    expect(events).toHaveLength(3);
    expect(events.filter((e) => e.type === 'item-created')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'recipe-updated')).toHaveLength(1);
    expect(events.every((e) => e.changeId === 'c2')).toBe(true);
  });

  it('stamps the recipe as cooked', async () => {
    const { body: created } = await createRecipe(pancakes);

    const res = await request(app).post(`/api/recipes/${created.id}/add-to-list`).send({});

    expect(res.body.recipe.plan_count).toBe(1);
    expect(res.body.recipe.last_planned_at).toBeTruthy();
  });

  it('adding twice produces two independent sets of items', async () => {
    const { body: created } = await createRecipe(pancakes);

    await request(app).post(`/api/recipes/${created.id}/add-to-list`).send({});
    await request(app).post(`/api/recipes/${created.id}/add-to-list`).send({});

    expect((await request(app).get('/api/items')).body).toHaveLength(4);
  });
});

describe('DELETE /api/recipes/:id/remove-from-list', () => {
  it('removes only the items that came from that recipe', async () => {
    const { body: created } = await createRecipe(pancakes);
    await request(app).post('/api/items').send({ name: 'Manual item' });
    await request(app).post(`/api/recipes/${created.id}/add-to-list`).send({});

    const res = await request(app).delete(`/api/recipes/${created.id}/remove-from-list`);

    expect(res.body.itemsRemoved).toBe(2);
    const remaining = (await request(app).get('/api/items')).body;
    expect(remaining.map((i) => i.name)).toEqual(['Manual item']);
  });

  it('is a no-op when the recipe contributed nothing', async () => {
    const { body: created } = await createRecipe(pancakes);

    const res = await request(app).delete(`/api/recipes/${created.id}/remove-from-list`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ itemsRemoved: 0 });
  });

  it('broadcasts an item-deleted event per removed item', async () => {
    const { body: created } = await createRecipe(pancakes);
    await request(app).post(`/api/recipes/${created.id}/add-to-list`).send({});

    const { events } = await captureEvents(() =>
      request(app).delete(`/api/recipes/${created.id}/remove-from-list`).send({ changeId: 'c3' })
    );

    expect(events).toHaveLength(2);
    expect(events.every((e) => e.type === 'item-deleted')).toBe(true);
  });

  it('deleting the recipe leaves already-added items on the list', async () => {
    const { body: created } = await createRecipe(pancakes);
    await request(app).post(`/api/recipes/${created.id}/add-to-list`).send({});

    await request(app).delete(`/api/recipes/${created.id}`);

    expect((await request(app).get('/api/items')).body).toHaveLength(2);
  });
});
