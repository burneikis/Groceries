import { create } from 'zustand';
import { NetworkError, categoriesApi, itemsApi, recipesApi } from '../services/api';
import * as db from '../services/db';
import {
  createTempId,
  processQueue,
  queueMutation,
  startSyncListener,
} from '../services/sync';
import LiveUpdatesService from '../services/liveUpdates';
import { positionForToggle, sortItems } from '../utils/sortItems';

/**
 * Only a genuine transport failure means "we are offline". Anything else
 * (including bugs in our own success path) must surface as a real error
 * rather than being silently queued for later replay.
 */
const isOfflineError = (error) => error instanceof NetworkError;

/** How long a changeId is remembered so its SSE echo can be ignored. */
const ECHO_WINDOW_MS = 30000;

const useStore = create((set, get) => {
  /**
   * Runs a mutation with a consistent offline story.
   *
   * @param {object} steps
   * @param {() => Promise<void>} [steps.optimistic] - Applied before the request
   * @param {(changeId: string) => Promise<any>} steps.remote - The API call
   * @param {() => Promise<any>} [steps.offline] - Local-only fallback; its
   *   return value becomes the mutation's result
   * @param {() => {action: string, data: object, tempId?: number}} [steps.queue]
   *   - Describes how to replay this mutation once back online
   * @param {(error: Error) => Promise<void>} [steps.revert] - Undo the
   *   optimistic update when the server rejects the change
   */
  const mutate = async ({ optimistic, remote, offline, queue, revert }) => {
    const changeId = get().generateChangeId();
    get().trackOwnChange(changeId); // Track before the call to avoid an echo race

    await optimistic?.();

    try {
      return await remote(changeId);
    } catch (error) {
      if (!isOfflineError(error)) {
        await revert?.(error);
        throw error;
      }

      const result = await offline?.();
      if (queue) {
        const { action, data, tempId } = queue();
        await queueMutation(action, data, tempId);
        await get().refreshPendingSyncs();
      }
      return result;
    }
  };

  /** Persist the current categories array to IndexedDB. */
  const persistCategories = () => db.saveCategories(get().categories);

  /**
   * Shared fetch-with-cache-fallback used by all three collections.
   * @param {'categories'|'items'|'recipes'} key
   * @param {() => Promise<object[]>} fetchRemote
   * @param {(data: object[]) => Promise<void>} saveLocal
   * @param {() => Promise<object[]>} readLocal
   */
  const fetchCollection = async (key, fetchRemote, saveLocal, readLocal) => {
    set((s) => ({ loading: { ...s.loading, [key]: true } }));
    try {
      const data = await fetchRemote();
      await saveLocal(data);
      set((s) => ({ [key]: data, loading: { ...s.loading, [key]: false } }));
    } catch (error) {
      if (!isOfflineError(error)) {
        set((s) => ({ error: error.message, loading: { ...s.loading, [key]: false } }));
        return;
      }
      const cached = await readLocal();
      set((s) => ({ [key]: cached, loading: { ...s.loading, [key]: false } }));
    }
  };

  return {
    // State
    categories: [],
    items: [],
    recipes: [],
    loading: { categories: false, items: false, recipes: false },
    error: null,
    isOnline: navigator.onLine,
    pendingSyncs: 0,
    theme: 'system', // 'light' | 'dark' | 'system'
    resolvedTheme: 'light',
    ownChangeIds: new Set(), // Our own changes, to suppress SSE echoes
    liveUpdatesConnected: false,

    /** Re-read the queue length rather than tracking it by hand. */
    refreshPendingSyncs: async () => {
      set({ pendingSyncs: await db.countSyncQueue() });
    },

    // --- Offline support ---------------------------------------------------

    initOfflineSupport: () => {
      const updateOnlineStatus = () => set({ isOnline: navigator.onLine });
      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);

      const { trackOwnChange, refreshPendingSyncs } = get();

      /** Pull fresh server state after a flush so temp ids are replaced. */
      const afterSync = async ({ synced }) => {
        if (synced > 0) {
          const { fetchCategories, fetchItems, fetchRecipes } = get();
          await Promise.all([fetchCategories(), fetchItems(), fetchRecipes()]);
        }
        await refreshPendingSyncs();
      };

      const stopSyncListener = startSyncListener(afterSync, trackOwnChange);

      // Flush anything left over from a previous session.
      refreshPendingSyncs()
        .then(() => (get().pendingSyncs > 0 ? processQueue(trackOwnChange) : null))
        .then((result) => result && afterSync(result))
        .catch((error) => console.error('[Sync] Startup flush failed:', error));

      return () => {
        window.removeEventListener('online', updateOnlineStatus);
        window.removeEventListener('offline', updateOnlineStatus);
        stopSyncListener();
      };
    },

    // --- Theme -------------------------------------------------------------

    applyTheme: () => {
      const { theme } = get();
      const resolved = theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme;

      document.documentElement.classList.toggle('dark', resolved === 'dark');
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', resolved === 'dark' ? '#0f172a' : '#ffffff');

      set({ resolvedTheme: resolved });
    },

    setTheme: (theme) => {
      set({ theme });
      localStorage.setItem('theme', theme);
      get().applyTheme();
    },

    initTheme: () => {
      const savedTheme = localStorage.getItem('theme');
      if (['light', 'dark', 'system'].includes(savedTheme)) {
        set({ theme: savedTheme });
      }
      get().applyTheme();

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        if (get().theme === 'system') get().applyTheme();
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    },

    // --- Live updates (SSE) ------------------------------------------------

    generateChangeId: () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,

    trackOwnChange: (changeId) => {
      if (!changeId) return;
      set((s) => ({ ownChangeIds: new Set(s.ownChangeIds).add(changeId) }));

      setTimeout(() => {
        set((s) => {
          const ids = new Set(s.ownChangeIds);
          ids.delete(changeId);
          return { ownChangeIds: ids };
        });
      }, ECHO_WINDOW_MS);
    },

    handleRemoteChange: async (event) => {
      const { type, data, changeId } = event;

      if (changeId && get().ownChangeIds.has(changeId)) return; // Our own echo

      const handlers = {
        'item-created': async () => {
          if (get().items.some((i) => i.id === data.id)) return;
          set((s) => ({ items: sortItems([...s.items, data]) }));
          await db.saveItem(data);
        },
        'item-updated': async () => {
          set((s) => ({ items: sortItems(s.items.map((i) => (i.id === data.id ? data : i))) }));
          await db.saveItem(data);
        },
        'item-deleted': async () => {
          set((s) => ({ items: s.items.filter((i) => i.id !== data.id) }));
          await db.deleteItemLocal(data.id);
        },
        'items-deleted-checked': async () => {
          const removed = new Set(data.ids ?? []);
          set((s) => ({ items: s.items.filter((i) => !removed.has(i.id)) }));
          await Promise.all([...removed].map((id) => db.deleteItemLocal(id)));
        },
        'items-reordered': async () => {
          set({ items: data });
          await db.saveItems(data);
        },
        'category-created': async () => {
          if (get().categories.some((c) => c.id === data.id)) return;
          set((s) => ({ categories: [...s.categories, data] }));
          await persistCategories();
        },
        'category-updated': async () => {
          set((s) => ({ categories: s.categories.map((c) => (c.id === data.id ? data : c)) }));
          await persistCategories();
        },
        'category-deleted': async () => {
          set((s) => ({ categories: s.categories.filter((c) => c.id !== data.id) }));
          await persistCategories();
        },
        'categories-reordered': async () => {
          set({ categories: data });
          await db.saveCategories(data);
        },
        'recipe-created': async () => {
          if (get().recipes.some((r) => r.id === data.id)) return;
          set((s) => ({ recipes: [...s.recipes, data] }));
          await db.saveRecipe(data);
        },
        'recipe-updated': async () => {
          set((s) => ({ recipes: s.recipes.map((r) => (r.id === data.id ? data : r)) }));
          await db.saveRecipe(data);
        },
        'recipe-deleted': async () => {
          set((s) => ({ recipes: s.recipes.filter((r) => r.id !== data.id) }));
          await db.deleteRecipeLocal(data.id);
        },
      };

      const handler = handlers[type];
      if (!handler) {
        console.warn('[LiveUpdates] Unknown event type:', type);
        return;
      }

      try {
        await handler();
      } catch (error) {
        console.error('[LiveUpdates] Error processing remote change:', error);
      }
    },

    initLiveUpdates: () => {
      const liveUpdates = new LiveUpdatesService();
      // Same-origin by default so the stream works from any device on the network
      const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;

      liveUpdates.connect(
        `${apiUrl}/api/events`,
        get().handleRemoteChange,
        (connected) => set({ liveUpdatesConnected: connected })
      );

      return () => liveUpdates.disconnect();
    },

    // --- Categories --------------------------------------------------------

    fetchCategories: () =>
      fetchCollection('categories', categoriesApi.getAll, db.saveCategories, db.getCategories),

    createCategory: (name) => {
      const tempId = createTempId();
      return mutate({
        remote: async (changeId) => {
          const category = await categoriesApi.create(name, changeId);
          set((s) => ({ categories: [...s.categories, category] }));
          await persistCategories();
          return category;
        },
        offline: async () => {
          const category = { id: tempId, name, sort_order: get().categories.length + 1 };
          set((s) => ({ categories: [...s.categories, category] }));
          await persistCategories();
          return category;
        },
        queue: () => ({ action: 'categories.create', data: { name }, tempId }),
      });
    },

    updateCategory: (id, name) =>
      mutate({
        remote: async (changeId) => {
          const updated = await categoriesApi.update(id, name, changeId);
          set((s) => ({ categories: s.categories.map((c) => (c.id === id ? updated : c)) }));
          await persistCategories();
        },
        offline: async () => {
          set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, name } : c)) }));
          await persistCategories();
        },
        queue: () => ({ action: 'categories.update', data: { id, name } }),
      }),

    deleteCategory: (id) => {
      const removeLocally = async () => {
        set((s) => ({ categories: s.categories.filter((c) => c.id !== id) }));
        await persistCategories();
      };
      return mutate({
        remote: async (changeId) => {
          await categoriesApi.delete(id, changeId);
          await removeLocally();
        },
        offline: removeLocally,
        queue: () => ({ action: 'categories.delete', data: { id } }),
      });
    },

    reorderCategories: (reordered) => {
      const updates = reordered.map((cat, i) => ({ id: cat.id, sort_order: i + 1 }));
      const previous = get().categories;

      return mutate({
        optimistic: async () => {
          const optimistic = reordered.map((cat, i) => ({ ...cat, sort_order: i + 1 }));
          set({ categories: optimistic });
          await db.saveCategories(optimistic);
        },
        remote: async (changeId) => {
          const categories = await categoriesApi.reorder(updates, changeId);
          set({ categories });
          await db.saveCategories(categories);
        },
        queue: () => ({ action: 'categories.reorder', data: { categories: updates } }),
        revert: async () => {
          set({ categories: previous });
          await db.saveCategories(previous);
        },
      });
    },

    // --- Items -------------------------------------------------------------

    fetchItems: () => fetchCollection('items', itemsApi.getAll, db.saveItems, db.getItems),

    createItem: (item) => {
      const tempId = createTempId();
      return mutate({
        remote: async (changeId) => {
          const newItem = await itemsApi.create(item, changeId);
          set((s) => ({ items: sortItems([...s.items, newItem]) }));
          await db.saveItem(newItem);
          return newItem;
        },
        offline: async () => {
          const now = new Date().toISOString();
          const tempItem = { id: tempId, ...item, checked: 0, created_at: now, updated_at: now };
          set((s) => ({ items: sortItems([...s.items, tempItem]) }));
          await db.saveItem(tempItem);
          return tempItem;
        },
        queue: () => ({ action: 'items.create', data: { item }, tempId }),
      });
    },

    updateItem: (id, item) =>
      mutate({
        remote: async (changeId) => {
          const updated = await itemsApi.update(id, item, changeId);
          set((s) => ({ items: sortItems(s.items.map((i) => (i.id === id ? updated : i))) }));
          await db.saveItem(updated);
        },
        offline: async () => {
          const existing = get().items.find((i) => i.id === id);
          const updated = { ...existing, ...item, updated_at: new Date().toISOString() };
          set((s) => ({ items: sortItems(s.items.map((i) => (i.id === id ? updated : i))) }));
          await db.saveItem(updated);
        },
        queue: () => ({ action: 'items.update', data: { id, item } }),
      }),

    toggleItemCheck: (id, checked) => {
      const previous = get().items.find((i) => i.id === id);

      return mutate({
        optimistic: async () => {
          set((s) => {
            const item = s.items.find((i) => i.id === id);
            if (!item) return {};
            const toggled = {
              ...item,
              checked: checked ? 1 : 0,
              position_in_list: positionForToggle(s.items, item, checked),
            };
            return { items: sortItems(s.items.map((i) => (i.id === id ? toggled : i))) };
          });

          const updated = get().items.find((i) => i.id === id);
          if (updated) await db.saveItem(updated);
        },
        remote: (changeId) => itemsApi.toggleCheck(id, checked, changeId),
        queue: () => ({ action: 'items.toggleCheck', data: { id, checked } }),
        revert: async () => {
          if (!previous) return;
          set((s) => ({ items: sortItems(s.items.map((i) => (i.id === id ? previous : i))) }));
          await db.saveItem(previous);
        },
      });
    },

    deleteItem: (id) => {
      const removeLocally = async () => {
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
        await db.deleteItemLocal(id);
      };
      return mutate({
        remote: async (changeId) => {
          await itemsApi.delete(id, changeId);
          await removeLocally();
        },
        offline: removeLocally,
        queue: () => ({ action: 'items.delete', data: { id } }),
      });
    },

    reorderItems: (reordered) => {
      const updates = reordered.map((item, i) => ({ id: item.id, position_in_list: i + 1 }));
      const previous = get().items;

      return mutate({
        optimistic: async () => {
          const reorderedIds = new Set(reordered.map((i) => i.id));
          const optimistic = sortItems([
            ...previous.filter((i) => !reorderedIds.has(i.id)),
            ...reordered.map((item, idx) => ({ ...item, position_in_list: idx + 1 })),
          ]);
          set({ items: optimistic });
          await db.saveItems(optimistic);
        },
        remote: async (changeId) => {
          const items = await itemsApi.reorder(updates, changeId);
          set({ items });
          await db.saveItems(items);
        },
        queue: () => ({ action: 'items.reorder', data: { items: updates } }),
        revert: async () => {
          set({ items: previous });
          await db.saveItems(previous);
        },
      });
    },

    deleteCheckedItems: () => {
      const checkedIds = get().items.filter((i) => i.checked).map((i) => i.id);
      const previous = get().items;

      return mutate({
        optimistic: async () => {
          set((s) => ({ items: s.items.filter((i) => !i.checked) }));
          await db.deleteCheckedItemsLocal();
        },
        // Scope the delete to the ids we actually saw checked, so a replay
        // cannot remove items somebody else checked in the meantime.
        remote: (changeId) => itemsApi.deleteChecked(checkedIds, changeId),
        queue: () => ({ action: 'items.deleteChecked', data: { ids: checkedIds } }),
        revert: async () => {
          set({ items: previous });
          await db.saveItems(previous);
        },
      });
    },

    // --- Recipes -----------------------------------------------------------

    fetchRecipes: () => fetchCollection('recipes', recipesApi.getAll, db.saveRecipes, db.getRecipes),

    createRecipe: (recipe) => {
      const tempId = createTempId();
      return mutate({
        remote: async (changeId) => {
          const newRecipe = await recipesApi.create(recipe, changeId);
          set((s) => ({ recipes: [...s.recipes, newRecipe] }));
          await db.saveRecipe(newRecipe);
          return newRecipe;
        },
        offline: async () => {
          const tempRecipe = { id: tempId, ...recipe, created_at: new Date().toISOString() };
          set((s) => ({ recipes: [...s.recipes, tempRecipe] }));
          await db.saveRecipe(tempRecipe);
          return tempRecipe;
        },
        queue: () => ({ action: 'recipes.create', data: { recipe }, tempId }),
      });
    },

    updateRecipe: (id, recipe) =>
      mutate({
        remote: async (changeId) => {
          const updated = await recipesApi.update(id, recipe, changeId);
          set((s) => ({ recipes: s.recipes.map((r) => (r.id === id ? updated : r)) }));
          await db.saveRecipe(updated);
        },
        offline: async () => {
          const updated = { ...get().recipes.find((r) => r.id === id), ...recipe };
          set((s) => ({ recipes: s.recipes.map((r) => (r.id === id ? updated : r)) }));
          await db.saveRecipe(updated);
        },
        queue: () => ({ action: 'recipes.update', data: { id, recipe } }),
      }),

    deleteRecipe: (id) => {
      const removeLocally = async () => {
        set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id) }));
        await db.deleteRecipeLocal(id);
      };
      return mutate({
        remote: async (changeId) => {
          await recipesApi.delete(id, changeId);
          await removeLocally();
        },
        offline: removeLocally,
        queue: () => ({ action: 'recipes.delete', data: { id } }),
      });
    },

    addRecipeToList: (id) =>
      mutate({
        remote: async (changeId) => {
          const result = await recipesApi.addToList(id, changeId);
          set((s) => ({ items: sortItems([...s.items, ...result.items]) }));
          await Promise.all(result.items.map((item) => db.saveItem(item)));
          return result;
        },
        offline: async () => ({ items: [] }),
        queue: () => ({ action: 'recipes.addToList', data: { id } }),
      }),

    removeRecipeFromList: (id) => {
      const previous = get().items;
      return mutate({
        optimistic: async () => {
          const remaining = previous.filter((i) => i.recipe_id !== id);
          set({ items: remaining });
          await db.saveItems(remaining);
        },
        remote: (changeId) => recipesApi.removeFromList(id, changeId),
        queue: () => ({ action: 'recipes.removeFromList', data: { id } }),
        revert: async () => {
          set({ items: previous });
          await db.saveItems(previous);
        },
      });
    },

    clearError: () => set({ error: null }),
  };
});

export default useStore;
