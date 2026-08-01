import { vi } from 'vitest';
import { createApp } from '../app.js';
import { closeDatabase, getDatabase, initializeDatabase } from '../db/database.js';
import { seedCategories } from '../db/seed.js';
import eventEmitter from '../services/events.js';

/**
 * Build an app backed by a fresh in-memory database.
 *
 * Each call throws away any previous database, so tests start from a known
 * state without touching the filesystem.
 *
 * @param {object} [options]
 * @param {boolean} [options.seed=true] - Insert the default categories
 * @returns {import('express').Express}
 */
export function createTestApp({ seed = true } = {}) {
  closeDatabase();
  initializeDatabase(':memory:');
  if (seed) seedCategories();
  return createApp({ logRequests: false, publicPath: '/nonexistent-public-dir' });
}

/** Tear down the database between tests. */
export function destroyTestApp() {
  closeDatabase();
}

/**
 * Capture every event broadcast while `fn` runs.
 *
 * Spies on the emitter rather than opening a real SSE connection, so route
 * tests can assert on broadcasts without managing a live stream.
 *
 * @param {() => Promise<any>} fn
 * @returns {Promise<{result: any, events: Array<{type: string, data: any, changeId: string|null}>}>}
 */
export async function captureEvents(fn) {
  const events = [];
  const spy = vi
    .spyOn(eventEmitter, 'emitChange')
    .mockImplementation((type, data, changeId = null) => {
      events.push({ type, data, changeId });
    });

  try {
    const result = await fn();
    return { result, events };
  } finally {
    spy.mockRestore();
  }
}

/** Silence the console for a test that intentionally triggers error logging. */
export function silenceConsole() {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
}

/**
 * Insert an item directly, bypassing the API.
 * @returns {number} the new item id
 */
export function insertItem({
  name = 'Item',
  category_id = null,
  checked = 0,
  position_in_list = 1,
  recipe_id = null,
  recipe_name = null,
} = {}) {
  const { lastInsertRowid } = getDatabase()
    .prepare(
      `INSERT INTO items (name, category_id, checked, position_in_list, recipe_id, recipe_name)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(name, category_id, checked, position_in_list, recipe_id, recipe_name);
  return Number(lastInsertRowid);
}

export { getDatabase };
