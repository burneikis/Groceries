import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from './database.js';
import { seedCategories } from './seed.js';

let tmp;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  tmp = mkdtempSync(join(tmpdir(), 'grocery-test-'));
});

afterEach(() => {
  closeDatabase();
  rmSync(tmp, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const dbFile = () => join(tmp, 'test.db');

describe('initializeDatabase', () => {
  it('creates every table the app relies on', () => {
    const db = initializeDatabase(dbFile());
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((t) => t.name);

    expect(tables).toEqual(
      expect.arrayContaining(['categories', 'items', 'recipes', 'recipe_ingredients', 'item_category_mappings'])
    );
  });

  it('enables WAL and foreign keys', () => {
    const db = initializeDatabase(dbFile());

    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('creates the indexes that keep list queries off full scans', () => {
    const db = initializeDatabase(dbFile());
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((i) => i.name);

    expect(indexes).toEqual(
      expect.arrayContaining([
        'idx_items_category',
        'idx_items_recipe',
        'idx_items_checked',
        'idx_recipe_ingredients_recipe',
      ])
    );
  });

  it('returns the same instance on repeated calls', () => {
    expect(initializeDatabase(dbFile())).toBe(initializeDatabase(dbFile()));
  });

  it('is idempotent across restarts and preserves data', () => {
    initializeDatabase(dbFile());
    seedCategories();
    getDatabase().prepare("INSERT INTO items (name) VALUES ('Milk')").run();
    closeDatabase();

    const db = initializeDatabase(dbFile());
    expect(db.prepare('SELECT COUNT(*) as c FROM items').get().c).toBe(1);
    expect(db.prepare('SELECT COUNT(*) as c FROM categories').get().c).toBe(10);
  });

  it('does not log SQL unless SQL_DEBUG is set', () => {
    const log = vi.spyOn(console, 'log');
    initializeDatabase(dbFile());
    getDatabase().prepare('SELECT 1').get();

    expect(log.mock.calls.flat().join(' ')).not.toContain('SELECT 1');
  });
});

describe('migrations', () => {
  it('stamps user_version once all migrations have run', () => {
    const db = initializeDatabase(dbFile());
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThan(0);
  });

  it('adds the recipe columns to a legacy items table', () => {
    // Build a pre-migration database: items without recipe_id/recipe_name.
    const path = dbFile();
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        amount TEXT,
        category_id INTEGER,
        checked INTEGER DEFAULT 0,
        position_in_list INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    legacy.prepare("INSERT INTO items (name) VALUES ('Legacy item')").run();
    legacy.pragma('user_version = 0');
    legacy.close();

    const db = initializeDatabase(path);
    const columns = db.pragma('table_info(items)').map((c) => c.name);

    expect(columns).toContain('recipe_id');
    expect(columns).toContain('recipe_name');
    expect(db.prepare('SELECT name FROM items').get().name).toBe('Legacy item');
  });

  it('tolerates a database that already has the columns but no user_version', () => {
    const path = dbFile();
    initializeDatabase(path);
    getDatabase().pragma('user_version = 0'); // simulate a pre-versioning database
    closeDatabase();

    expect(() => initializeDatabase(path)).not.toThrow();
    expect(getDatabase().pragma('user_version', { simple: true })).toBeGreaterThan(0);
  });

  it('does not re-run migrations on an up-to-date database', () => {
    const path = dbFile();
    initializeDatabase(path);
    const version = getDatabase().pragma('user_version', { simple: true });
    closeDatabase();

    const log = vi.spyOn(console, 'log');
    initializeDatabase(path);

    expect(getDatabase().pragma('user_version', { simple: true })).toBe(version);
    expect(log.mock.calls.flat().join(' ')).not.toContain('Applied migration');
  });
});

describe('getDatabase', () => {
  it('throws a helpful error before initialization', () => {
    closeDatabase();
    expect(() => getDatabase()).toThrow(/not initialized/i);
  });
});

describe('closeDatabase', () => {
  it('is safe to call when nothing is open', () => {
    closeDatabase();
    expect(() => closeDatabase()).not.toThrow();
  });
});

describe('schema constraints', () => {
  beforeEach(() => {
    initializeDatabase(dbFile());
    seedCategories();
  });

  it('rejects duplicate category names', () => {
    expect(() =>
      getDatabase().prepare("INSERT INTO categories (name, sort_order) VALUES ('Bakery', 99)").run()
    ).toThrow(/UNIQUE/);
  });

  it('cascades ingredient deletion when a recipe is removed', () => {
    const db = getDatabase();
    const { lastInsertRowid: recipeId } = db.prepare("INSERT INTO recipes (name) VALUES ('R')").run();
    db.prepare("INSERT INTO recipe_ingredients (recipe_id, name) VALUES (?, 'Flour')").run(recipeId);

    db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);

    expect(db.prepare('SELECT COUNT(*) as c FROM recipe_ingredients').get().c).toBe(0);
  });
});

describe('seedCategories', () => {
  it('inserts the ten defaults on an empty database', () => {
    initializeDatabase(dbFile());
    seedCategories();

    expect(getDatabase().prepare('SELECT COUNT(*) as c FROM categories').get().c).toBe(10);
  });

  it('does not duplicate categories when run again', () => {
    initializeDatabase(dbFile());
    seedCategories();
    seedCategories();

    expect(getDatabase().prepare('SELECT COUNT(*) as c FROM categories').get().c).toBe(10);
  });
});
