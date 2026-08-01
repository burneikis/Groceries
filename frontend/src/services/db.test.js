import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let db;

// The module memoizes its connection, so both it and the backing store must be
// reset together to give each test a clean database.
beforeEach(async () => {
  global.indexedDB = new IDBFactory();
  vi.resetModules();
  db = await import('./db.js');
});

describe('categories', () => {
  it('round-trips categories sorted by sort_order', async () => {
    await db.saveCategories([
      { id: 2, name: 'B', sort_order: 2 },
      { id: 1, name: 'A', sort_order: 1 },
    ]);

    expect((await db.getCategories()).map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('replaces the whole set rather than merging', async () => {
    await db.saveCategories([{ id: 1, name: 'A', sort_order: 1 }]);
    await db.saveCategories([{ id: 2, name: 'B', sort_order: 1 }]);

    const categories = await db.getCategories();
    expect(categories).toHaveLength(1);
    expect(categories[0].name).toBe('B');
  });

  it('returns an empty array before anything is cached', async () => {
    expect(await db.getCategories()).toEqual([]);
  });
});

describe('items', () => {
  it('saves and reads back a list of items', async () => {
    await db.saveItems([{ id: 1, name: 'Milk' }, { id: 2, name: 'Bread' }]);

    expect(await db.getItems()).toHaveLength(2);
  });

  it('upserts a single item without touching the others', async () => {
    await db.saveItems([{ id: 1, name: 'Milk' }, { id: 2, name: 'Bread' }]);
    await db.saveItem({ id: 1, name: 'Oat milk' });

    const items = await db.getItems();
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.id === 1).name).toBe('Oat milk');
  });

  it('inserts an item that is not yet cached', async () => {
    await db.saveItem({ id: 99, name: 'New' });
    expect(await db.getItems()).toHaveLength(1);
  });

  it('deletes a single item', async () => {
    await db.saveItems([{ id: 1, name: 'Milk' }, { id: 2, name: 'Bread' }]);
    await db.deleteItemLocal(1);

    expect((await db.getItems()).map((i) => i.id)).toEqual([2]);
  });

  it('deleting a missing item is a no-op', async () => {
    await expect(db.deleteItemLocal(404)).resolves.not.toThrow();
  });

  it('deletes only checked items', async () => {
    await db.saveItems([
      { id: 1, name: 'Milk', checked: 1 },
      { id: 2, name: 'Bread', checked: 0 },
      { id: 3, name: 'Eggs', checked: 1 },
    ]);

    await db.deleteCheckedItemsLocal();

    expect((await db.getItems()).map((i) => i.id)).toEqual([2]);
  });
});

describe('recipes', () => {
  it('round-trips recipes and supports single upsert and delete', async () => {
    await db.saveRecipes([{ id: 1, name: 'Pancakes' }]);
    await db.saveRecipe({ id: 2, name: 'Curry' });

    expect(await db.getRecipes()).toHaveLength(2);

    await db.deleteRecipeLocal(1);
    expect((await db.getRecipes()).map((r) => r.id)).toEqual([2]);
  });
});

describe('sync queue', () => {
  it('returns the generated key when queuing', async () => {
    const key = await db.addToSyncQueue({ action: 'items.delete', data: { id: 1 } });
    expect(key).toBeDefined();
  });

  it('stamps new entries with a zero retry count and a timestamp', async () => {
    await db.addToSyncQueue({ action: 'items.delete', data: { id: 1 } });

    const [entry] = await db.getSyncQueue();
    expect(entry.retries).toBe(0);
    expect(entry.timestamp).toBeTypeOf('number');
  });

  it('preserves insertion order so replays stay causally correct', async () => {
    for (const id of [10, 20, 30]) {
      await db.addToSyncQueue({ action: 'items.delete', data: { id } });
    }

    expect((await db.getSyncQueue()).map((e) => e.data.id)).toEqual([10, 20, 30]);
  });

  it('counts pending entries', async () => {
    expect(await db.countSyncQueue()).toBe(0);

    await db.addToSyncQueue({ action: 'items.delete', data: { id: 1 } });
    await db.addToSyncQueue({ action: 'items.delete', data: { id: 2 } });

    expect(await db.countSyncQueue()).toBe(2);
  });

  it('persists updates to an entry without changing its position', async () => {
    await db.addToSyncQueue({ action: 'items.delete', data: { id: 1 } });
    await db.addToSyncQueue({ action: 'items.delete', data: { id: 2 } });

    const [first] = await db.getSyncQueue();
    await db.updateSyncEntry({ ...first, retries: 3 });

    const queue = await db.getSyncQueue();
    expect(queue[0].retries).toBe(3);
    expect(queue.map((e) => e.data.id)).toEqual([1, 2]);
  });

  it('removes a single entry by key', async () => {
    await db.addToSyncQueue({ action: 'items.delete', data: { id: 1 } });
    await db.addToSyncQueue({ action: 'items.delete', data: { id: 2 } });

    const [first] = await db.getSyncQueue();
    await db.removeSyncEntry(first.id);

    expect((await db.getSyncQueue()).map((e) => e.data.id)).toEqual([2]);
  });

  it('clears the whole queue', async () => {
    await db.addToSyncQueue({ action: 'items.delete', data: { id: 1 } });
    await db.clearSyncQueue();

    expect(await db.countSyncQueue()).toBe(0);
  });

  it('keeps the tempId used for later id remapping', async () => {
    await db.addToSyncQueue({ action: 'items.create', data: { item: {} }, tempId: -123 });

    const [entry] = await db.getSyncQueue();
    expect(entry.tempId).toBe(-123);
  });
});
