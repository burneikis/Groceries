import { create } from 'zustand';
import { categoriesApi, itemsApi, recipesApi } from '../services/api';

const useStore = create((set, get) => ({
  // State
  categories: [],
  items: [],
  recipes: [],
  loading: false,
  error: null,

  // Categories
  fetchCategories: async () => {
    try {
      const categories = await categoriesApi.getAll();
      set({ categories });
    } catch (error) {
      set({ error: error.message });
    }
  },

  createCategory: async (name) => {
    const category = await categoriesApi.create(name);
    set((s) => ({ categories: [...s.categories, category] }));
    return category;
  },

  updateCategory: async (id, name) => {
    const updated = await categoriesApi.update(id, name);
    set((s) => ({
      categories: s.categories.map((c) => (c.id === id ? updated : c)),
    }));
  },

  deleteCategory: async (id) => {
    await categoriesApi.delete(id);
    set((s) => ({
      categories: s.categories.filter((c) => c.id !== id),
    }));
  },

  reorderCategories: async (reordered) => {
    const updates = reordered.map((cat, i) => ({ id: cat.id, sort_order: i + 1 }));
    const categories = await categoriesApi.reorder(updates);
    set({ categories });
  },

  // Items
  fetchItems: async () => {
    try {
      const items = await itemsApi.getAll();
      set({ items });
    } catch (error) {
      set({ error: error.message });
    }
  },

  createItem: async (item) => {
    const newItem = await itemsApi.create(item);
    set((s) => ({ items: [...s.items, newItem] }));
    return newItem;
  },

  updateItem: async (id, item) => {
    const updated = await itemsApi.update(id, item);
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? updated : i)),
    }));
  },

  toggleItemCheck: async (id, checked) => {
    // Optimistic update
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, checked: checked ? 1 : 0 } : i)),
    }));
    try {
      await itemsApi.toggleCheck(id, checked);
    } catch {
      // Revert on failure
      set((s) => ({
        items: s.items.map((i) => (i.id === id ? { ...i, checked: checked ? 0 : 1 } : i)),
      }));
    }
  },

  deleteItem: async (id) => {
    await itemsApi.delete(id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },

  deleteCheckedItems: async () => {
    await itemsApi.deleteChecked();
    set((s) => ({ items: s.items.filter((i) => !i.checked) }));
  },

  // Recipes
  fetchRecipes: async () => {
    try {
      const recipes = await recipesApi.getAll();
      set({ recipes });
    } catch (error) {
      set({ error: error.message });
    }
  },

  createRecipe: async (recipe) => {
    const newRecipe = await recipesApi.create(recipe);
    set((s) => ({ recipes: [...s.recipes, newRecipe] }));
    return newRecipe;
  },

  updateRecipe: async (id, recipe) => {
    const updated = await recipesApi.update(id, recipe);
    set((s) => ({
      recipes: s.recipes.map((r) => (r.id === id ? updated : r)),
    }));
  },

  deleteRecipe: async (id) => {
    await recipesApi.delete(id);
    set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id) }));
  },

  addRecipeToList: async (id) => {
    const result = await recipesApi.addToList(id);
    set((s) => ({ items: [...s.items, ...result.items] }));
    return result;
  },

  clearError: () => set({ error: null }),
}));

export default useStore;
