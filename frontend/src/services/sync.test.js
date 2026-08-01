import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, NetworkError, categoriesApi, itemsApi, recipesApi } from './api';
import { getSyncQueue } from './db';
import { createTempId, processQueue, queueMutation } from './sync';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal();
  const stub = (names) => Object.fromEntries(names.map((n) => [n, vi.fn()]));
  return {
    ...actual,
    categoriesApi: stub(['create', 'update', 'delete', 'reorder']),
    itemsApi: stub(['create', 'update', 'toggleCheck', 'delete', 'deleteChecked', 'reorder']),
    recipesApi: stub(['create', 'update', 'delete', 'addToList', 'removeFromList']),
  };
});

const drainQueue = async () => {
  for (const entry of await getSyncQueue()) {
    const { removeSyncEntry } = await import('./db');
    await removeSyncEntry(entry.id);
  }
};

beforeEach(async () => {
  vi.clearAllMocks();
  await drainQueue();
});

afterEach(() => vi.restoreAllMocks());

describe('queueMutation', () => {
  it('rejects actions that have no replay handler', async () => {
    await expect(queueMutation('items.explode', {})).rejects.toThrow(/Unknown sync action/);
  });

  it('accepts every action the store can enqueue', async () => {
    const storeActions = [
      'categories.create', 'categories.update', 'categories.delete', 'categories.reorder',
      'items.create', 'items.update', 'items.toggleCheck', 'items.delete',
      'items.deleteChecked', 'items.reorder',
      'recipes.create', 'recipes.update', 'recipes.delete',
      'recipes.addToList', 'recipes.removeFromList',
    ];
    for (const action of storeActions) {
      await expect(queueMutation(action, {})).resolves.not.toThrow();
    }
    expect(await getSyncQueue()).toHaveLength(storeActions.length);
  });
});

describe('processQueue', () => {
  it('replays entries in order and clears the queue', async () => {
    const calls = [];
    itemsApi.create.mockImplementation(async (item) => {
      calls.push(item.name);
      return { id: calls.length, ...item };
    });

    await queueMutation('items.create', { item: { name: 'a' } }, createTempId());
    await queueMutation('items.create', { item: { name: 'b' } }, createTempId());

    const result = await processQueue();

    expect(calls).toEqual(['a', 'b']);
    expect(result).toMatchObject({ synced: 2, failed: 0, remaining: 0 });
    expect(await getSyncQueue()).toHaveLength(0);
  });

  it('passes a changeId so the originating client can suppress its own echo', async () => {
    itemsApi.delete.mockResolvedValue(null);
    const tracked = [];

    await queueMutation('items.delete', { id: 7 });
    await processQueue((id) => tracked.push(id));

    expect(tracked).toHaveLength(1);
    expect(itemsApi.delete).toHaveBeenCalledWith(7, tracked[0]);
  });

  it('stops at a network failure and keeps that entry and the ones after it', async () => {
    itemsApi.delete.mockResolvedValueOnce(null).mockRejectedValueOnce(new NetworkError());
    itemsApi.toggleCheck.mockResolvedValue({});

    await queueMutation('items.delete', { id: 1 });
    await queueMutation('items.delete', { id: 2 });
    await queueMutation('items.toggleCheck', { id: 3, checked: true });

    const result = await processQueue();

    expect(result.synced).toBe(1);
    expect(itemsApi.toggleCheck).not.toHaveBeenCalled(); // ordering preserved
    expect(await getSyncQueue()).toHaveLength(2);
  });

  it('drops entries the server permanently rejects', async () => {
    itemsApi.delete.mockRejectedValue(new ApiError(404, 'Item not found'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await queueMutation('items.delete', { id: 99 });
    const result = await processQueue();

    expect(result).toMatchObject({ synced: 0, failed: 1, remaining: 0 });
  });

  it('retries transient server errors instead of discarding the change', async () => {
    itemsApi.delete.mockRejectedValue(new ApiError(500, 'boom'));

    await queueMutation('items.delete', { id: 5 });
    await processQueue();

    const [entry] = await getSyncQueue();
    expect(entry.retries).toBe(1); // still queued, will be retried

    for (let i = 0; i < 4; i++) await processQueue();
    expect(await getSyncQueue()).toHaveLength(0); // given up after MAX_RETRIES
  });

  it('remaps a temporary id onto the real one for later entries', async () => {
    const tempId = createTempId();
    itemsApi.create.mockResolvedValue({ id: 42, name: 'Milk' });
    itemsApi.update.mockResolvedValue({});
    itemsApi.delete.mockResolvedValue(null);

    await queueMutation('items.create', { item: { name: 'Milk' } }, tempId);
    await queueMutation('items.update', { id: tempId, item: { name: 'Oat milk' } });
    await queueMutation('items.delete', { id: tempId });

    const result = await processQueue();

    expect(itemsApi.update).toHaveBeenCalledWith(42, { name: 'Oat milk' }, expect.any(String));
    expect(itemsApi.delete).toHaveBeenCalledWith(42, expect.any(String));
    expect(result.synced).toBe(3);
  });

  it('remaps temporary ids nested in arrays', async () => {
    const tempCategory = createTempId();
    categoriesApi.create.mockResolvedValue({ id: 7, name: 'Snacks' });
    categoriesApi.reorder.mockResolvedValue([]);
    itemsApi.deleteChecked.mockResolvedValue({});

    await queueMutation('categories.create', { name: 'Snacks' }, tempCategory);
    await queueMutation('categories.reorder', {
      categories: [{ id: 1, sort_order: 1 }, { id: tempCategory, sort_order: 2 }],
    });

    await processQueue();

    expect(categoriesApi.reorder).toHaveBeenCalledWith(
      [{ id: 1, sort_order: 1 }, { id: 7, sort_order: 2 }],
      expect.any(String)
    );
  });

  it('scopes deleteChecked to the ids the client actually saw checked', async () => {
    itemsApi.deleteChecked.mockResolvedValue({});

    await queueMutation('items.deleteChecked', { ids: [1, 2, 3] });
    await processQueue();

    expect(itemsApi.deleteChecked).toHaveBeenCalledWith([1, 2, 3], expect.any(String));
  });

  it('drops entries whose temporary id was never resolved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    itemsApi.update.mockResolvedValue({});

    await queueMutation('items.update', { id: createTempId(), item: { name: 'orphan' } });
    const result = await processQueue();

    expect(itemsApi.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ failed: 1, remaining: 0 });
  });

  it('replays recipe reordering and removal actions that previously had no handler', async () => {
    itemsApi.reorder.mockResolvedValue([]);
    recipesApi.removeFromList.mockResolvedValue({});

    await queueMutation('items.reorder', { items: [{ id: 1, position_in_list: 1 }] });
    await queueMutation('recipes.removeFromList', { id: 3 });

    const result = await processQueue();

    expect(itemsApi.reorder).toHaveBeenCalled();
    expect(recipesApi.removeFromList).toHaveBeenCalledWith(3, expect.any(String));
    expect(result.synced).toBe(2);
  });
});
