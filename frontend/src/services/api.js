const API_BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 204) return null;

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

// Categories
export const categoriesApi = {
  getAll: () => request('/categories'),
  create: (name, changeId) => request('/categories', {
    method: 'POST',
    body: JSON.stringify({ name, changeId }),
  }),
  update: (id, name, changeId) => request(`/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, changeId }),
  }),
  delete: (id, changeId) => request(`/categories/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ changeId }),
  }),
  reorder: (categories, changeId) => request('/categories/reorder', {
    method: 'PUT',
    body: JSON.stringify({ categories, changeId }),
  }),
};

// Items
export const itemsApi = {
  getAll: () => request('/items'),
  suggestCategory: (name) => request(`/items/suggest-category?name=${encodeURIComponent(name)}`),
  create: (item, changeId) => request('/items', {
    method: 'POST',
    body: JSON.stringify({ ...item, changeId }),
  }),
  update: (id, item, changeId) => request(`/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...item, changeId }),
  }),
  toggleCheck: (id, checked, changeId) => request(`/items/${id}/check`, {
    method: 'PATCH',
    body: JSON.stringify({ checked, changeId }),
  }),
  delete: (id, changeId) => request(`/items/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ changeId }),
  }),
  deleteChecked: (changeId) => request('/items/checked', {
    method: 'DELETE',
    body: JSON.stringify({ changeId }),
  }),
};

// Recipes
export const recipesApi = {
  getAll: () => request('/recipes'),
  getById: (id) => request(`/recipes/${id}`),
  create: (recipe, changeId) => request('/recipes', {
    method: 'POST',
    body: JSON.stringify({ ...recipe, changeId }),
  }),
  update: (id, recipe, changeId) => request(`/recipes/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...recipe, changeId }),
  }),
  delete: (id, changeId) => request(`/recipes/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ changeId }),
  }),
  addToList: (id, changeId) => request(`/recipes/${id}/add-to-list`, {
    method: 'POST',
    body: JSON.stringify({ changeId }),
  }),
};
