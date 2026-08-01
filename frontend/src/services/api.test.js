import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError, categoriesApi, itemsApi, recipesApi } from './api';

/** Stub fetch with a JSON response. */
const mockJson = (body, { status = 200 } = {}) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
};

const lastCall = () => global.fetch.mock.calls[0];
const lastBody = () => JSON.parse(lastCall()[1].body);

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete global.fetch;
});

describe('error classification', () => {
  it('wraps a transport failure in NetworkError', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(itemsApi.getAll()).rejects.toBeInstanceOf(NetworkError);
  });

  it('preserves the original failure as the cause', async () => {
    const cause = new TypeError('Failed to fetch');
    global.fetch = vi.fn().mockRejectedValue(cause);

    await expect(itemsApi.getAll()).rejects.toMatchObject({ cause });
  });

  it('raises ApiError with the server message on an error status', async () => {
    mockJson({ error: 'Item not found' }, { status: 404 });

    await expect(itemsApi.getAll()).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Item not found',
    });
  });

  it('falls back to a generic message when the body has no error field', async () => {
    mockJson(null, { status: 500 });

    await expect(itemsApi.getAll()).rejects.toThrow('Request failed: 500');
  });

  it('survives an error response with an unparseable body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    });

    await expect(itemsApi.getAll()).rejects.toBeInstanceOf(ApiError);
  });

  it('marks 4xx as permanent and 5xx as retryable', () => {
    expect(new ApiError(400, 'x').isPermanent).toBe(true);
    expect(new ApiError(404, 'x').isPermanent).toBe(true);
    expect(new ApiError(409, 'x').isPermanent).toBe(true);
    expect(new ApiError(500, 'x').isPermanent).toBe(false);
    expect(new ApiError(503, 'x').isPermanent).toBe(false);
  });

  it('does not classify a NetworkError as permanent', () => {
    expect(new NetworkError() instanceof ApiError).toBe(false);
  });
});

describe('responses', () => {
  it('returns null for 204 without parsing a body', async () => {
    const json = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json });

    await expect(itemsApi.delete(1)).resolves.toBeNull();
    expect(json).not.toHaveBeenCalled();
  });

  it('returns the parsed body on success', async () => {
    mockJson([{ id: 1, name: 'Milk' }]);

    await expect(itemsApi.getAll()).resolves.toEqual([{ id: 1, name: 'Milk' }]);
  });
});

describe('request construction', () => {
  it('prefixes paths with /api and sends JSON content type', async () => {
    mockJson([]);
    await itemsApi.getAll();

    expect(lastCall()[0]).toBe('/api/items');
    expect(lastCall()[1].headers['Content-Type']).toBe('application/json');
  });

  it('url-encodes the suggest-category query', async () => {
    mockJson({ category_id: null });
    await itemsApi.suggestCategory('Ben & Jerry\'s');

    expect(lastCall()[0]).toBe("/api/items/suggest-category?name=Ben%20%26%20Jerry's");
  });

  it('threads changeId through every mutating call', async () => {
    const calls = [
      () => categoriesApi.create('n', 'cid'),
      () => categoriesApi.update(1, 'n', 'cid'),
      () => categoriesApi.delete(1, 'cid'),
      () => categoriesApi.reorder([], 'cid'),
      () => itemsApi.create({ name: 'n' }, 'cid'),
      () => itemsApi.update(1, { name: 'n' }, 'cid'),
      () => itemsApi.toggleCheck(1, true, 'cid'),
      () => itemsApi.delete(1, 'cid'),
      () => itemsApi.deleteChecked([1], 'cid'),
      () => itemsApi.reorder([], 'cid'),
      () => recipesApi.create({ name: 'n' }, 'cid'),
      () => recipesApi.update(1, { name: 'n' }, 'cid'),
      () => recipesApi.delete(1, 'cid'),
      () => recipesApi.addToList(1, 'cid'),
      () => recipesApi.removeFromList(1, 'cid'),
    ];

    for (const call of calls) {
      mockJson({});
      await call();
      expect(lastBody().changeId).toBe('cid');
      vi.restoreAllMocks();
    }
  });

  it('uses the HTTP verb each endpoint expects', async () => {
    const expectations = [
      [() => itemsApi.create({ name: 'n' }), 'POST', '/api/items'],
      [() => itemsApi.update(1, { name: 'n' }), 'PUT', '/api/items/1'],
      [() => itemsApi.toggleCheck(1, true), 'PATCH', '/api/items/1/check'],
      [() => itemsApi.delete(1), 'DELETE', '/api/items/1'],
      [() => itemsApi.deleteChecked([1]), 'DELETE', '/api/items/checked'],
      [() => itemsApi.reorder([]), 'PUT', '/api/items/reorder'],
      [() => categoriesApi.reorder([]), 'PUT', '/api/categories/reorder'],
      [() => recipesApi.addToList(3), 'POST', '/api/recipes/3/add-to-list'],
      [() => recipesApi.removeFromList(3), 'DELETE', '/api/recipes/3/remove-from-list'],
    ];

    for (const [call, method, path] of expectations) {
      mockJson({});
      await call();
      expect(lastCall()[0]).toBe(path);
      expect(lastCall()[1].method).toBe(method);
      vi.restoreAllMocks();
    }
  });

  it('spreads item fields into the body rather than nesting them', async () => {
    mockJson({});
    await itemsApi.create({ name: 'Milk', amount: '1L', category_id: 8 }, 'cid');

    expect(lastBody()).toEqual({ name: 'Milk', amount: '1L', category_id: 8, changeId: 'cid' });
  });

  it('sends the scoped id list for deleteChecked', async () => {
    mockJson({});
    await itemsApi.deleteChecked([1, 2, 3], 'cid');

    expect(lastBody()).toEqual({ ids: [1, 2, 3], changeId: 'cid' });
  });
});
