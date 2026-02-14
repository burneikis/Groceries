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
  create: (name) => request('/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }),
  update: (id, name) => request(`/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  }),
  delete: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
  reorder: (categories) => request('/categories/reorder', {
    method: 'PUT',
    body: JSON.stringify(categories),
  }),
};

// Items
export const itemsApi = {
  getAll: () => request('/items'),
  create: (item) => request('/items', {
    method: 'POST',
    body: JSON.stringify(item),
  }),
  update: (id, item) => request(`/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify(item),
  }),
  toggleCheck: (id, checked) => request(`/items/${id}/check`, {
    method: 'PATCH',
    body: JSON.stringify({ checked }),
  }),
  delete: (id) => request(`/items/${id}`, { method: 'DELETE' }),
  deleteChecked: () => request('/items/checked', { method: 'DELETE' }),
};

// Recipes
export const recipesApi = {
  getAll: () => request('/recipes'),
  getById: (id) => request(`/recipes/${id}`),
  create: (recipe) => request('/recipes', {
    method: 'POST',
    body: JSON.stringify(recipe),
  }),
  update: (id, recipe) => request(`/recipes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(recipe),
  }),
  delete: (id) => request(`/recipes/${id}`, { method: 'DELETE' }),
  addToList: (id) => request(`/recipes/${id}/add-to-list`, { method: 'POST' }),
};
