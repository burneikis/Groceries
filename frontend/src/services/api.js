const API_BASE = '/api';

/** The request never reached the server (offline, DNS, connection refused). */
export class NetworkError extends Error {
  constructor(cause) {
    super('Network request failed');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/** The server responded, but with an error status. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  /** 4xx responses will never succeed on replay, so queued entries can be dropped. */
  get isPermanent() {
    return this.status >= 400 && this.status < 500;
  }
}

async function request(path, { headers, ...options } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  } catch (error) {
    throw new NetworkError(error);
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `Request failed: ${res.status}`);
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
  deleteChecked: (ids, changeId) => request('/items/checked', {
    method: 'DELETE',
    body: JSON.stringify({ ids, changeId }),
  }),
  reorder: (items, changeId) => request('/items/reorder', {
    method: 'PUT',
    body: JSON.stringify({ items, changeId }),
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
  removeFromList: (id, changeId) => request(`/recipes/${id}/remove-from-list`, {
    method: 'DELETE',
    body: JSON.stringify({ changeId }),
  }),
  setRegular: (id, isRegular, changeId) => request(`/recipes/${id}/regular`, {
    method: 'PATCH',
    body: JSON.stringify({ is_regular: isRegular, changeId }),
  }),
};

// Recurring items (offered in the dinner wizard)
export const recurringApi = {
  getAll: () => request('/recurring'),
  create: (recurring, changeId) => request('/recurring', {
    method: 'POST',
    body: JSON.stringify({ ...recurring, changeId }),
  }),
  update: (id, recurring, changeId) => request(`/recurring/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...recurring, changeId }),
  }),
  delete: (id, changeId) => request(`/recurring/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ changeId }),
  }),
};

// Weekly dinner plan
export const mealPlanApi = {
  getSuggestions: (count) => request(`/mealplan/suggestions?count=${count}`),
  confirm: (recipeIds, excludedIngredientIds, recurringItemIds, changeId) => request('/mealplan/confirm', {
    method: 'POST',
    body: JSON.stringify({ recipeIds, excludedIngredientIds, recurringItemIds, changeId }),
  }),
};
