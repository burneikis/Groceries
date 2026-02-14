import { create } from 'zustand';
import { categoriesApi, itemsApi, recipesApi } from '../services/api';
import * as db from '../services/db';
import { addToSyncQueue } from '../services/db';
import { processQueue, startSyncListener } from '../services/sync';

function isOfflineError(err) {
  return !navigator.onLine || err.message === 'Failed to fetch' || err.name === 'TypeError';
}

const useStore = create((set, get) => ({
  // State
  categories: [],
  items: [],
  recipes: [],
  loading: { categories: false, items: false, recipes: false },
  error: null,
  isOnline: navigator.onLine,
  pendingSyncs: 0,
  theme: 'system', // 'light' | 'dark' | 'system'
  resolvedTheme: 'light', // actual theme being applied

  // Helper to update pending syncs count
  updatePendingSyncs: async () => {
    const queue = await db.getSyncQueue();
    set({ pendingSyncs: queue.length });
  },

  // Initialize offline listeners
  initOfflineSupport: () => {
    const updateOnlineStatus = () => {
      set({ isOnline: navigator.onLine });
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Start sync listener - refresh data after sync
    const cleanup = startSyncListener(async () => {
      const { fetchCategories, fetchItems, fetchRecipes, updatePendingSyncs } = get();
      await Promise.all([fetchCategories(), fetchItems(), fetchRecipes()]);
      await updatePendingSyncs();
    });

    // Check for pending syncs
    const { updatePendingSyncs } = get();
    updatePendingSyncs().then(async () => {
      const queue = await db.getSyncQueue();
      if (queue.length > 0 && navigator.onLine) {
        await processQueue();
        await updatePendingSyncs();
      }
    });

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      cleanup();
    };
  },

  // Theme management
  applyTheme: () => {
    const { theme } = get();
    let resolved = theme;

    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    // Apply dark class to html element
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Update meta theme-color for mobile
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', resolved === 'dark' ? '#0f172a' : '#ffffff');
    }

    set({ resolvedTheme: resolved });
  },

  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem('theme', theme);
    get().applyTheme();
  },

  initTheme: () => {
    // Load theme preference from localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
      set({ theme: savedTheme });
    }

    // Apply initial theme
    get().applyTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (get().theme === 'system') {
        get().applyTheme();
      }
    };
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  },

  // Categories
  fetchCategories: async () => {
    set((s) => ({ loading: { ...s.loading, categories: true } }));
    try {
      const categories = await categoriesApi.getAll();
      await db.saveCategories(categories);
      set((s) => ({ categories, loading: { ...s.loading, categories: false } }));
    } catch (error) {
      if (isOfflineError(error)) {
        const categories = await db.getCategories();
        set((s) => ({ categories, loading: { ...s.loading, categories: false } }));
      } else {
        set((s) => ({ error: error.message, loading: { ...s.loading, categories: false } }));
      }
    }
  },

  createCategory: async (name) => {
    try {
      const category = await categoriesApi.create(name);
      await db.saveCategories([...get().categories, category]);
      set((s) => ({ categories: [...s.categories, category] }));
      return category;
    } catch (error) {
      if (isOfflineError(error)) {
        const tempId = -Date.now();
        const category = { id: tempId, name, sort_order: get().categories.length + 1 };
        set((s) => ({ categories: [...s.categories, category] }));
        await db.saveCategories(get().categories);
        await addToSyncQueue({ action: 'categories.create', data: { name } });
        set((s) => ({ pendingSyncs: s.pendingSyncs + 1 }));
        return category;
      }
      throw error;
    }
  },

  updateCategory: async (id, name) => {
    try {
      const updated = await categoriesApi.update(id, name);
      set((s) => ({
        categories: s.categories.map((c) => (c.id === id ? updated : c)),
      }));
      await db.saveCategories(get().categories);
    } catch (error) {
      if (isOfflineError(error)) {
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, name } : c)),
        }));
        await db.saveCategories(get().categories);
        await addToSyncQueue({ action: 'categories.update', data: { id, name } });
        set((s) => ({ pendingSyncs: s.pendingSyncs + 1 }));
      } else {
        throw error;
      }
    }
  },

  deleteCategory: async (id) => {
    try {
      await categoriesApi.delete(id);
      set((s) => ({
        categories: s.categories.filter((c) => c.id !== id),
      }));
      await db.saveCategories(get().categories);
    } catch (error) {
      if (isOfflineError(error)) {
        set((s) => ({
          categories: s.categories.filter((c) => c.id !== id),
        }));
        await db.saveCategories(get().categories);
        await addToSyncQueue({ action: 'categories.delete', data: { id } });
        set((s) => ({ pendingSyncs: s.pendingSyncs + 1 }));
      } else {
        throw error;
      }
    }
  },

  reorderCategories: async (reordered) => {
    const updates = reordered.map((cat, i) => ({ id: cat.id, sort_order: i + 1 }));
    // Optimistic update
    const optimistic = reordered.map((cat, i) => ({ ...cat, sort_order: i + 1 }));
    set({ categories: optimistic });
    await db.saveCategories(optimistic);

    try {
      const categories = await categoriesApi.reorder(updates);
      set({ categories });
      await db.saveCategories(categories);
    } catch (error) {
      if (isOfflineError(error)) {
        await addToSyncQueue({ action: 'categories.reorder', data: { categories: updates } });
        set((s) => ({ pendingSyncs: s.pendingSyncs + 1 }));
      } else {
        throw error;
      }
    }
  },

  // Items
  fetchItems: async () => {
    set((s) => ({ loading: { ...s.loading, items: true } }));
    try {
      const items = await itemsApi.getAll();
      await db.saveItems(items);
      set((s) => ({ items, loading: { ...s.loading, items: false } }));
    } catch (error) {
      if (isOfflineError(error)) {
        const items = await db.getItems();
        set((s) => ({ items, loading: { ...s.loading, items: false } }));
      } else {
        set((s) => ({ error: error.message, loading: { ...s.loading, items: false } }));
      }
    }
  },

  createItem: async (item) => {
    try {
      const newItem = await itemsApi.create(item);
      set((s) => ({ items: [...s.items, newItem] }));
      await db.saveItem(newItem);
      return newItem;
    } catch (error) {
      if (isOfflineError(error)) {
        const tempItem = {
          id: -Date.now(),
          ...item,
          checked: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set((s) => ({ items: [...s.items, tempItem] }));
        await db.saveItem(tempItem);
        await addToSyncQueue({ action: 'items.create', data: { item } });
        set((s) => ({ pendingSyncs: s.pendingSyncs + 1 }));
        return tempItem;
      }
      throw error;
    }
  },

  updateItem: async (id, item) => {
    try {
      const updated = await itemsApi.update(id, item);
      set((s) => ({
        items: s.items.map((i) => (i.id === id ? updated : i)),
      }));
      await db.saveItem(updated);
    } catch (error) {
      if (isOfflineError(error)) {
        const updated = { ...get().items.find((i) => i.id === id), ...item, updated_at: new Date().toISOString() };
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? updated : i)),
        }));
        await db.saveItem(updated);
        await addToSyncQueue({ action: 'items.update', data: { id, item } });
        set((s) => ({ pendingSyncs: s.pendingSyncs + 1 }));
      } else {
        throw error;
      }
    }
  },

  toggleItemCheck: async (id, checked) => {
    // Optimistic update
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, checked: checked ? 1 : 0 } : i)),
    }));
    const updatedItem = get().items.find((i) => i.id === id);
    if (updatedItem) await db.saveItem(updatedItem);

    try {
      await itemsApi.toggleCheck(id, checked);
    } catch (error) {
      if (isOfflineError(error)) {
        await addToSyncQueue({ action: 'items.toggleCheck', data: { id, checked } });
        set((s) => ({ pendingSyncs: s.pendingSyncs + 1 }));
      } else {
        // Revert on non-network failure
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, checked: checked ? 0 : 1 } : i)),
        }));
        const revertedItem = get().items.find((i) => i.id === id);
        if (revertedItem) await db.saveItem(revertedItem);
      }
    }
  },

  deleteItem: async (id) => {
    try {
      await itemsApi.delete(id);
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
      await db.deleteItemLocal(id);
    } catch (error) {
      if (isOfflineError(error)) {
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
        await db.deleteItemLocal(id);
        await addToSyncQueue({ action: 'items.delete', data: { id } });
        set((s) => ({ pendingSyncs: s.pendingSyncs + 1 }));
      } else {
        throw error;
      }
    }
  },

  deleteCheckedItems: async () => {
    const checkedIds = get().items.filter((i) => i.checked).map((i) => i.id);
    set((s) => ({ items: s.items.filter((i) => !i.checked) }));
    await db.deleteCheckedItemsLocal();

    try {
      await itemsApi.deleteChecked();
    } catch (error) {
      if (isOfflineError(error)) {
        await addToSyncQueue({ action: 'items.deleteChecked', data: { ids: checkedIds } });
        set((s) => ({ pendingSyncs: s.pendingSyncs + 1 }));
      } else {
        throw error;
      }
    }
  },

  // Recipes
  fetchRecipes: async () => {
    set((s) => ({ loading: { ...s.loading, recipes: true } }));
    try {
      const recipes = await recipesApi.getAll();
      await db.saveRecipes(recipes);
      set((s) => ({ recipes, loading: { ...s.loading, recipes: false } }));
    } catch (error) {
      if (isOfflineError(error)) {
        const recipes = await db.getRecipes();
        set((s) => ({ recipes, loading: { ...s.loading, recipes: false } }));
      } else {
        set((s) => ({ error: error.message, loading: { ...s.loading, recipes: false } }));
      }
    }
  },

  createRecipe: async (recipe) => {
    try {
      const newRecipe = await recipesApi.create(recipe);
      set((s) => ({ recipes: [...s.recipes, newRecipe] }));
      await db.saveRecipe(newRecipe);
      return newRecipe;
    } catch (error) {
      if (isOfflineError(error)) {
        const tempRecipe = {
          id: -Date.now(),
          ...recipe,
          created_at: new Date().toISOString(),
        };
        set((s) => ({ recipes: [...s.recipes, tempRecipe] }));
        await db.saveRecipe(tempRecipe);
        await addToSyncQueue({ action: 'recipes.create', data: { recipe } });
        set((s) => ({ pendingSyncs: s.pendingSyncs + 1 }));
        return tempRecipe;
      }
      throw error;
    }
  },

  updateRecipe: async (id, recipe) => {
    try {
      const updated = await recipesApi.update(id, recipe);
      set((s) => ({
        recipes: s.recipes.map((r) => (r.id === id ? updated : r)),
      }));
      await db.saveRecipe(updated);
    } catch (error) {
      if (isOfflineError(error)) {
        const updated = { ...get().recipes.find((r) => r.id === id), ...recipe };
        set((s) => ({
          recipes: s.recipes.map((r) => (r.id === id ? updated : r)),
        }));
        await db.saveRecipe(updated);
        await addToSyncQueue({ action: 'recipes.update', data: { id, recipe } });
        set((s) => ({ pendingSyncs: s.pendingSyncs + 1 }));
      } else {
        throw error;
      }
    }
  },

  deleteRecipe: async (id) => {
    try {
      await recipesApi.delete(id);
      set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id) }));
      await db.deleteRecipeLocal(id);
    } catch (error) {
      if (isOfflineError(error)) {
        set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id) }));
        await db.deleteRecipeLocal(id);
        await addToSyncQueue({ action: 'recipes.delete', data: { id } });
        set((s) => ({ pendingSyncs: s.pendingSyncs + 1 }));
      } else {
        throw error;
      }
    }
  },

  addRecipeToList: async (id) => {
    try {
      const result = await recipesApi.addToList(id);
      set((s) => ({ items: [...s.items, ...result.items] }));
      for (const item of result.items) {
        await db.saveItem(item);
      }
      return result;
    } catch (error) {
      if (isOfflineError(error)) {
        await addToSyncQueue({ action: 'recipes.addToList', data: { id } });
        set((s) => ({ pendingSyncs: s.pendingSyncs + 1 }));
        return { items: [] };
      }
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));

export default useStore;
