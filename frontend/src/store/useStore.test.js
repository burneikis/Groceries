import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, NetworkError } from '../services/api';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  const stub = (names) => Object.fromEntries(names.map((n) => [n, vi.fn()]));
  return {
    ...actual,
    categoriesApi: stub(['getAll', 'create', 'update', 'delete', 'reorder']),
    itemsApi: stub([
      'getAll', 'create', 'update', 'toggleCheck', 'delete', 'deleteChecked', 'reorder',
    ]),
    recipesApi: stub([
      'getAll', 'create', 'update', 'delete', 'addToList', 'removeFromList', 'setRegular',
    ]),
    mealPlanApi: stub(['getSuggestions', 'confirm']),
  };
});

let useStore;
let categoriesApi;
let itemsApi;
let recipesApi;
let mealPlanApi;
let db;

/** Fresh store + IndexedDB for every test. */
beforeEach(async () => {
  global.indexedDB = new IDBFactory();
  vi.resetModules();
  vi.clearAllMocks();

  ({ categoriesApi, itemsApi, recipesApi, mealPlanApi } = await import('../services/api'));
  db = await import('../services/db');
  useStore = (await import('./useStore')).default;

  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const state = () => useStore.getState();
const offline = () => new NetworkError(new TypeError('Failed to fetch'));

describe('fetching', () => {
  it('loads items from the server and caches them', async () => {
    itemsApi.getAll.mockResolvedValue([{ id: 1, name: 'Milk' }]);

    await state().fetchItems();

    expect(state().items).toEqual([{ id: 1, name: 'Milk' }]);
    expect(await db.getItems()).toHaveLength(1);
  });

  it('falls back to the cache when offline', async () => {
    await db.saveItems([{ id: 1, name: 'Cached' }]);
    itemsApi.getAll.mockRejectedValue(offline());

    await state().fetchItems();

    expect(state().items).toEqual([{ id: 1, name: 'Cached' }]);
    expect(state().error).toBeNull(); // offline is not an error state
  });

  it('surfaces a real server error instead of silently using the cache', async () => {
    itemsApi.getAll.mockRejectedValue(new ApiError(500, 'Internal server error'));

    await state().fetchItems();

    expect(state().error).toBe('Internal server error');
  });

  it('clears the loading flag on both success and failure', async () => {
    itemsApi.getAll.mockResolvedValue([]);
    await state().fetchItems();
    expect(state().loading.items).toBe(false);

    itemsApi.getAll.mockRejectedValue(offline());
    await state().fetchItems();
    expect(state().loading.items).toBe(false);
  });

  it('loads categories and recipes the same way', async () => {
    categoriesApi.getAll.mockResolvedValue([{ id: 1, name: 'Dairy', sort_order: 1 }]);
    recipesApi.getAll.mockResolvedValue([{ id: 1, name: 'Pancakes' }]);

    await state().fetchCategories();
    await state().fetchRecipes();

    expect(state().categories).toHaveLength(1);
    expect(state().recipes).toHaveLength(1);
  });
});

describe('creating items', () => {
  it('adds the server-returned item to the list', async () => {
    itemsApi.create.mockResolvedValue({ id: 1, name: 'Milk', checked: 0 });

    const created = await state().createItem({ name: 'Milk' });

    expect(created.id).toBe(1);
    expect(state().items).toHaveLength(1);
  });

  it('sends a changeId so the SSE echo can be ignored', async () => {
    itemsApi.create.mockResolvedValue({ id: 1, name: 'Milk' });

    await state().createItem({ name: 'Milk' });

    const changeId = itemsApi.create.mock.calls[0][1];
    expect(changeId).toBeTypeOf('string');
    expect(state().ownChangeIds.has(changeId)).toBe(true);
  });

  it('creates a placeholder item and queues the mutation when offline', async () => {
    itemsApi.create.mockRejectedValue(offline());

    const created = await state().createItem({ name: 'Milk' });

    expect(created.id).toBeLessThan(0); // temporary id
    expect(state().items).toHaveLength(1);

    const queue = await db.getSyncQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ action: 'items.create', tempId: created.id });
  });

  it('updates the pending badge when a mutation is queued', async () => {
    itemsApi.create.mockRejectedValue(offline());

    await state().createItem({ name: 'Milk' });

    expect(state().pendingSyncs).toBe(1);
  });

  it('rethrows a genuine server error rather than queueing it', async () => {
    itemsApi.create.mockRejectedValue(new ApiError(400, 'Item name is required'));

    await expect(state().createItem({ name: '' })).rejects.toThrow('Item name is required');
    expect(await db.getSyncQueue()).toHaveLength(0);
  });
});

describe('toggling an item', () => {
  beforeEach(async () => {
    await state().fetchItems.call(null); // no-op guard
    useStore.setState({
      items: [
        { id: 1, name: 'Milk', checked: 0, category_id: 1, position_in_list: 1 },
        { id: 2, name: 'Bread', checked: 0, category_id: 1, position_in_list: 2 },
      ],
    });
  });

  it('updates the UI immediately, before the server responds', async () => {
    let resolve;
    itemsApi.toggleCheck.mockReturnValue(new Promise((r) => { resolve = r; }));

    const pending = state().toggleItemCheck(1, true);
    await Promise.resolve();

    expect(state().items.find((i) => i.id === 1).checked).toBe(1);

    resolve({});
    await pending;
  });

  it('reorders optimistically to match where the server will put it', async () => {
    itemsApi.toggleCheck.mockResolvedValue({});

    await state().toggleItemCheck(1, true);

    const item = state().items.find((i) => i.id === 1);
    expect(item.position_in_list).toBe(-1); // top of the empty checked group
    expect(state().items[state().items.length - 1].id).toBe(1); // sorted last
  });

  it('reverts the optimistic change when the server rejects it', async () => {
    itemsApi.toggleCheck.mockRejectedValue(new ApiError(404, 'Item not found'));

    await expect(state().toggleItemCheck(1, true)).rejects.toThrow();

    expect(state().items.find((i) => i.id === 1).checked).toBe(0);
  });

  it('keeps the optimistic change and queues it when offline', async () => {
    itemsApi.toggleCheck.mockRejectedValue(offline());

    await state().toggleItemCheck(1, true);

    expect(state().items.find((i) => i.id === 1).checked).toBe(1);
    expect((await db.getSyncQueue())[0]).toMatchObject({
      action: 'items.toggleCheck',
      data: { id: 1, checked: true },
    });
  });
});

describe('updating and deleting a single item', () => {
  beforeEach(() => {
    useStore.setState({
      items: [{ id: 1, name: 'Milk', checked: 0, category_id: 1, position_in_list: 1 }],
    });
  });

  it('replaces the item with the server response', async () => {
    itemsApi.update.mockResolvedValue({ id: 1, name: 'Oat milk', checked: 0 });

    await state().updateItem(1, { name: 'Oat milk' });

    expect(state().items[0].name).toBe('Oat milk');
  });

  it('applies the edit locally and queues it when offline', async () => {
    itemsApi.update.mockRejectedValue(offline());

    await state().updateItem(1, { name: 'Oat milk' });

    expect(state().items[0].name).toBe('Oat milk');
    expect(state().items[0].category_id).toBe(1); // untouched fields survive
    expect((await db.getSyncQueue())[0]).toMatchObject({
      action: 'items.update',
      data: { id: 1, item: { name: 'Oat milk' } },
    });
  });

  it('removes the item once the server confirms', async () => {
    itemsApi.delete.mockResolvedValue(null);

    await state().deleteItem(1);

    expect(state().items).toHaveLength(0);
    expect(await db.getItems()).toHaveLength(0);
  });

  it('removes it locally and queues the delete when offline', async () => {
    itemsApi.delete.mockRejectedValue(offline());

    await state().deleteItem(1);

    expect(state().items).toHaveLength(0);
    expect((await db.getSyncQueue())[0]).toMatchObject({
      action: 'items.delete',
      data: { id: 1 },
    });
  });

  it('keeps the item when the server rejects the delete', async () => {
    itemsApi.delete.mockRejectedValue(new ApiError(500, 'boom'));

    await expect(state().deleteItem(1)).rejects.toThrow();

    expect(state().items).toHaveLength(1);
  });
});

describe('updating and deleting recipes', () => {
  beforeEach(() => {
    useStore.setState({ recipes: [{ id: 1, name: 'Pancakes', ingredients: [] }] });
  });

  it('replaces the recipe with the server response', async () => {
    recipesApi.update.mockResolvedValue({ id: 1, name: 'Crepes', ingredients: [] });

    await state().updateRecipe(1, { name: 'Crepes', ingredients: [] });

    expect(state().recipes[0].name).toBe('Crepes');
  });

  it('applies the edit locally and queues it when offline', async () => {
    recipesApi.update.mockRejectedValue(offline());

    await state().updateRecipe(1, { name: 'Crepes', ingredients: [] });

    expect(state().recipes[0].name).toBe('Crepes');
    expect((await db.getSyncQueue())[0].action).toBe('recipes.update');
  });

  it('deletes a recipe and queues the delete when offline', async () => {
    recipesApi.delete.mockResolvedValue(null);
    await state().deleteRecipe(1);
    expect(state().recipes).toHaveLength(0);

    useStore.setState({ recipes: [{ id: 2, name: 'Curry' }] });
    recipesApi.delete.mockRejectedValue(offline());
    await state().deleteRecipe(2);

    expect(state().recipes).toHaveLength(0);
    expect((await db.getSyncQueue())[0]).toMatchObject({
      action: 'recipes.delete',
      data: { id: 2 },
    });
  });
});

describe('categories offline edits', () => {
  beforeEach(() => {
    useStore.setState({ categories: [{ id: 1, name: 'Dairy', sort_order: 1 }] });
  });

  it('renames locally and queues the change when offline', async () => {
    categoriesApi.update.mockRejectedValue(offline());

    await state().updateCategory(1, 'Dairy & Eggs');

    expect(state().categories[0].name).toBe('Dairy & Eggs');
    expect((await db.getSyncQueue())[0]).toMatchObject({
      action: 'categories.update',
      data: { id: 1, name: 'Dairy & Eggs' },
    });
  });

  it('deletes locally and queues the change when offline', async () => {
    categoriesApi.delete.mockRejectedValue(offline());

    await state().deleteCategory(1);

    expect(state().categories).toHaveLength(0);
    expect((await db.getSyncQueue())[0]).toMatchObject({
      action: 'categories.delete',
      data: { id: 1 },
    });
  });

  it('reverts a failed category reorder', async () => {
    useStore.setState({
      categories: [{ id: 1, name: 'A', sort_order: 1 }, { id: 2, name: 'B', sort_order: 2 }],
    });
    categoriesApi.reorder.mockRejectedValue(new ApiError(500, 'boom'));

    await expect(
      state().reorderCategories([
        { id: 2, name: 'B', sort_order: 2 },
        { id: 1, name: 'A', sort_order: 1 },
      ])
    ).rejects.toThrow();

    expect(state().categories.map((c) => c.id)).toEqual([1, 2]);
  });
});

describe('deleting checked items', () => {
  beforeEach(() => {
    useStore.setState({
      items: [
        { id: 1, name: 'Milk', checked: 1 },
        { id: 2, name: 'Bread', checked: 0 },
        { id: 3, name: 'Eggs', checked: 1 },
      ],
    });
  });

  it('removes checked items and scopes the request to their ids', async () => {
    itemsApi.deleteChecked.mockResolvedValue({});

    await state().deleteCheckedItems();

    expect(state().items.map((i) => i.id)).toEqual([2]);
    expect(itemsApi.deleteChecked).toHaveBeenCalledWith([1, 3], expect.any(String));
  });

  it('queues the same scoped id list when offline', async () => {
    itemsApi.deleteChecked.mockRejectedValue(offline());

    await state().deleteCheckedItems();

    expect((await db.getSyncQueue())[0]).toMatchObject({
      action: 'items.deleteChecked',
      data: { ids: [1, 3] },
    });
  });

  it('restores the list if the server rejects the delete', async () => {
    itemsApi.deleteChecked.mockRejectedValue(new ApiError(500, 'boom'));

    await expect(state().deleteCheckedItems()).rejects.toThrow();

    expect(state().items).toHaveLength(3);
  });
});

describe('reordering', () => {
  it('applies the new order optimistically and reverts on failure', async () => {
    useStore.setState({
      items: [
        { id: 1, name: 'a', position_in_list: 1, checked: 0 },
        { id: 2, name: 'b', position_in_list: 2, checked: 0 },
      ],
    });
    itemsApi.reorder.mockRejectedValue(new ApiError(500, 'boom'));

    const reordered = [
      { id: 2, name: 'b', position_in_list: 2, checked: 0 },
      { id: 1, name: 'a', position_in_list: 1, checked: 0 },
    ];
    await expect(state().reorderItems(reordered)).rejects.toThrow();

    expect(state().items.map((i) => i.id)).toEqual([1, 2]); // reverted
  });

  it('queues a reorder made while offline', async () => {
    useStore.setState({ items: [{ id: 1, name: 'a', position_in_list: 1, checked: 0 }] });
    itemsApi.reorder.mockRejectedValue(offline());

    await state().reorderItems([{ id: 1, name: 'a', position_in_list: 1, checked: 0 }]);

    expect((await db.getSyncQueue())[0].action).toBe('items.reorder');
  });

  it('reorders categories optimistically', async () => {
    useStore.setState({
      categories: [{ id: 1, name: 'A', sort_order: 1 }, { id: 2, name: 'B', sort_order: 2 }],
    });
    categoriesApi.reorder.mockResolvedValue([
      { id: 2, name: 'B', sort_order: 1 },
      { id: 1, name: 'A', sort_order: 2 },
    ]);

    await state().reorderCategories([
      { id: 2, name: 'B', sort_order: 2 },
      { id: 1, name: 'A', sort_order: 1 },
    ]);

    expect(state().categories.map((c) => c.id)).toEqual([2, 1]);
  });
});

describe('recipes', () => {
  it('adds returned items to the list when a recipe is added', async () => {
    recipesApi.addToList.mockResolvedValue({
      items: [{ id: 10, name: 'Flour', recipe_id: 1 }, { id: 11, name: 'Eggs', recipe_id: 1 }],
    });

    await state().addRecipeToList(1);

    expect(state().items).toHaveLength(2);
  });

  it('removes a recipe\'s items optimistically', async () => {
    useStore.setState({
      items: [
        { id: 1, name: 'Flour', recipe_id: 7 },
        { id: 2, name: 'Manual', recipe_id: null },
      ],
    });
    recipesApi.removeFromList.mockResolvedValue({});

    await state().removeRecipeFromList(7);

    expect(state().items.map((i) => i.id)).toEqual([2]);
  });

  it('queues recipe removal when offline', async () => {
    useStore.setState({ items: [{ id: 1, recipe_id: 7 }] });
    recipesApi.removeFromList.mockRejectedValue(offline());

    await state().removeRecipeFromList(7);

    expect((await db.getSyncQueue())[0]).toMatchObject({
      action: 'recipes.removeFromList',
      data: { id: 7 },
    });
  });

  it('toggles the regular flag optimistically', async () => {
    useStore.setState({ recipes: [{ id: 7, name: 'Chilli', is_regular: 0 }] });
    recipesApi.setRegular.mockResolvedValue({ id: 7, name: 'Chilli', is_regular: 1 });

    await state().toggleRecipeRegular(7, true);

    expect(recipesApi.setRegular).toHaveBeenCalledWith(7, true, expect.any(String));
    expect(state().recipes[0].is_regular).toBe(1);
  });

  it('reverts the regular flag when the server rejects it', async () => {
    useStore.setState({ recipes: [{ id: 7, name: 'Chilli', is_regular: 0 }] });
    recipesApi.setRegular.mockRejectedValue(new ApiError(404, 'Recipe not found'));

    await expect(state().toggleRecipeRegular(7, true)).rejects.toThrow('Recipe not found');
    expect(state().recipes[0].is_regular).toBe(0);
  });

  it('queues the regular flag when offline', async () => {
    useStore.setState({ recipes: [{ id: 7, name: 'Chilli', is_regular: 0 }] });
    recipesApi.setRegular.mockRejectedValue(offline());

    await state().toggleRecipeRegular(7, true);

    expect(state().recipes[0].is_regular).toBe(1);
    expect((await db.getSyncQueue())[0]).toMatchObject({
      action: 'recipes.setRegular',
      data: { id: 7, isRegular: true },
    });
  });

  it('creates a placeholder recipe offline', async () => {
    recipesApi.create.mockRejectedValue(offline());

    const recipe = await state().createRecipe({ name: 'Pancakes', ingredients: [] });

    expect(recipe.id).toBeLessThan(0);
    expect((await db.getSyncQueue())[0].action).toBe('recipes.create');
  });
});

describe('meal plan', () => {
  it('stores suggestions and the pool', async () => {
    mealPlanApi.getSuggestions.mockResolvedValue({ suggestions: [{ id: 1 }], pool: [{ id: 1 }] });

    await state().fetchMealPlanSuggestions(4);

    expect(mealPlanApi.getSuggestions).toHaveBeenCalledWith(4);
    expect(state().mealPlan).toMatchObject({ suggestions: [{ id: 1 }], loading: false });
  });

  it('explains that suggestions need a connection when offline', async () => {
    mealPlanApi.getSuggestions.mockRejectedValue(offline());

    await expect(state().fetchMealPlanSuggestions(4)).rejects.toThrow();
    expect(state().mealPlan.error).toMatch(/connection/i);
  });

  it('merges confirmed items and refreshed recipes into state', async () => {
    useStore.setState({ items: [], recipes: [{ id: 1, name: 'Chilli', plan_count: 0 }] });
    mealPlanApi.confirm.mockResolvedValue({
      itemsAdded: 1,
      items: [{ id: 5, name: 'Beans', recipe_id: 1 }],
      recipes: [{ id: 1, name: 'Chilli', plan_count: 1 }],
    });

    const result = await state().confirmMealPlan([1], []);

    expect(result.itemsAdded).toBe(1);
    expect(state().items).toHaveLength(1);
    expect(state().recipes[0].plan_count).toBe(1);
  });

  it('queues the confirmation when offline', async () => {
    mealPlanApi.confirm.mockRejectedValue(offline());

    const result = await state().confirmMealPlan([1, 2], [3]);

    expect(result.queued).toBe(true);
    expect((await db.getSyncQueue())[0]).toMatchObject({
      action: 'mealplan.confirm',
      data: { recipeIds: [1, 2], excludedIngredientIds: [3] },
    });
  });
});

describe('categories', () => {
  it('creates, renames and deletes against the server', async () => {
    categoriesApi.create.mockResolvedValue({ id: 1, name: 'Dairy', sort_order: 1 });
    await state().createCategory('Dairy');
    expect(state().categories).toHaveLength(1);

    categoriesApi.update.mockResolvedValue({ id: 1, name: 'Milk & Cheese', sort_order: 1 });
    await state().updateCategory(1, 'Milk & Cheese');
    expect(state().categories[0].name).toBe('Milk & Cheese');

    categoriesApi.delete.mockResolvedValue(null);
    await state().deleteCategory(1);
    expect(state().categories).toHaveLength(0);
  });

  it('queues a category created offline with a temp id', async () => {
    categoriesApi.create.mockRejectedValue(offline());

    const category = await state().createCategory('Dairy');

    expect(category.id).toBeLessThan(0);
    expect((await db.getSyncQueue())[0]).toMatchObject({
      action: 'categories.create',
      tempId: category.id,
    });
  });
});

describe('remote change handling', () => {
  it('ignores the echo of a change this client made', async () => {
    const changeId = 'own-change';
    state().trackOwnChange(changeId);

    await state().handleRemoteChange({
      type: 'item-created',
      data: { id: 1, name: 'Milk' },
      changeId,
    });

    expect(state().items).toHaveLength(0);
  });

  it('applies a change made by another client', async () => {
    await state().handleRemoteChange({
      type: 'item-created',
      data: { id: 1, name: 'Milk' },
      changeId: 'someone-else',
    });

    expect(state().items).toHaveLength(1);
  });

  it('does not duplicate an item it already has', async () => {
    useStore.setState({ items: [{ id: 1, name: 'Milk' }] });

    await state().handleRemoteChange({ type: 'item-created', data: { id: 1, name: 'Milk' } });

    expect(state().items).toHaveLength(1);
  });

  it('prunes exactly the ids named in items-deleted-checked', async () => {
    useStore.setState({
      items: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });

    await state().handleRemoteChange({
      type: 'items-deleted-checked',
      data: { ids: [1, 3] },
    });

    expect(state().items.map((i) => i.id)).toEqual([2]);
  });

  it('applies updates, deletions and reorders', async () => {
    useStore.setState({ items: [{ id: 1, name: 'Milk', checked: 0 }] });

    await state().handleRemoteChange({
      type: 'item-updated',
      data: { id: 1, name: 'Oat milk', checked: 0 },
    });
    expect(state().items[0].name).toBe('Oat milk');

    await state().handleRemoteChange({ type: 'item-deleted', data: { id: 1 } });
    expect(state().items).toHaveLength(0);
  });

  it('handles category and recipe events', async () => {
    await state().handleRemoteChange({
      type: 'category-created',
      data: { id: 1, name: 'Dairy', sort_order: 1 },
    });
    expect(state().categories).toHaveLength(1);

    await state().handleRemoteChange({ type: 'category-deleted', data: { id: 1 } });
    expect(state().categories).toHaveLength(0);

    await state().handleRemoteChange({ type: 'recipe-created', data: { id: 1, name: 'Pancakes' } });
    expect(state().recipes).toHaveLength(1);

    await state().handleRemoteChange({ type: 'recipe-deleted', data: { id: 1 } });
    expect(state().recipes).toHaveLength(0);
  });

  it('warns about an unrecognized event type without throwing', async () => {
    const warn = vi.spyOn(console, 'warn');

    await expect(
      state().handleRemoteChange({ type: 'nonsense', data: {} })
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
  });

  it('forgets a tracked changeId once the echo window elapses', async () => {
    vi.useFakeTimers();
    state().trackOwnChange('temporary');
    expect(state().ownChangeIds.has('temporary')).toBe(true);

    vi.advanceTimersByTime(30000);
    expect(state().ownChangeIds.has('temporary')).toBe(false);
    vi.useRealTimers();
  });
});

describe('theme', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it('persists the chosen theme and applies the dark class', () => {
    state().setTheme('dark');

    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes the dark class for the light theme', () => {
    state().setTheme('dark');
    state().setTheme('light');

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('resolves the system theme from the media query', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    state().setTheme('system');

    expect(state().resolvedTheme).toBe('dark');
  });

  it('restores a saved theme and ignores a corrupt one', () => {
    localStorage.setItem('theme', 'dark');
    state().initTheme();
    expect(state().theme).toBe('dark');

    localStorage.setItem('theme', 'chartreuse');
    state().initTheme();
    expect(state().theme).toBe('dark'); // unchanged
  });
});

describe('offline support lifecycle', () => {
  it('tracks online/offline transitions', () => {
    const cleanup = state().initOfflineSupport();

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    expect(state().isOnline).toBe(false);

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    expect(state().isOnline).toBe(true);

    cleanup();
  });

  it('stops listening after cleanup', () => {
    const cleanup = state().initOfflineSupport();
    cleanup();

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));

    expect(state().isOnline).toBe(true); // listener removed
  });

  it('refetches everything after a successful flush', async () => {
    itemsApi.create.mockRejectedValue(offline());
    await state().createItem({ name: 'Milk' });

    itemsApi.create.mockResolvedValue({ id: 1, name: 'Milk' });
    itemsApi.getAll.mockResolvedValue([{ id: 1, name: 'Milk' }]);
    categoriesApi.getAll.mockResolvedValue([]);
    recipesApi.getAll.mockResolvedValue([]);

    const cleanup = state().initOfflineSupport();
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(itemsApi.getAll).toHaveBeenCalled());

    expect(state().items[0].id).toBe(1); // temp id replaced by the real one
    expect(state().pendingSyncs).toBe(0);

    cleanup();
  });
});

describe('clearError', () => {
  it('resets the error state', () => {
    useStore.setState({ error: 'something went wrong' });
    state().clearError();
    expect(state().error).toBeNull();
  });
});
