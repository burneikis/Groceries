import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '../db/database.js';
import { seedCategories } from '../db/seed.js';
import {
  cleanupOldMappings,
  getSuggestedCategory,
  learnCategoryMapping,
  updateMappingUsage,
} from './categorization.js';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  closeDatabase();
  initializeDatabase(':memory:');
  seedCategories();
});

afterEach(() => {
  closeDatabase();
  vi.restoreAllMocks();
});

const mappingFor = (name) =>
  getDatabase()
    .prepare('SELECT * FROM item_category_mappings WHERE item_name_lower = ?')
    .get(name);

describe('getSuggestedCategory', () => {
  it('returns null when nothing has been learned', () => {
    expect(getSuggestedCategory('Milk')).toBeNull();
  });

  it('returns the learned category', () => {
    learnCategoryMapping('Milk', 8);
    expect(getSuggestedCategory('Milk')).toBe(8);
  });

  it('normalizes case and surrounding whitespace', () => {
    learnCategoryMapping('  MiLK ', 8);

    expect(getSuggestedCategory('milk')).toBe(8);
    expect(getSuggestedCategory('MILK')).toBe(8);
    expect(getSuggestedCategory('  Milk  ')).toBe(8);
  });

  it('treats distinct names separately', () => {
    learnCategoryMapping('Milk', 8);
    expect(getSuggestedCategory('Milkshake')).toBeNull();
  });
});

describe('learnCategoryMapping', () => {
  it('creates a mapping with a use count of one', () => {
    learnCategoryMapping('Milk', 8);
    expect(mappingFor('milk')).toMatchObject({ category_id: 8, use_count: 1 });
  });

  it('increments the use count when the same mapping is reinforced', () => {
    learnCategoryMapping('Milk', 8);
    learnCategoryMapping('Milk', 8);
    learnCategoryMapping('Milk', 8);

    expect(mappingFor('milk').use_count).toBe(3);
  });

  it('lets a newer assignment override the remembered category', () => {
    learnCategoryMapping('Milk', 8);
    learnCategoryMapping('Milk', 1);

    expect(getSuggestedCategory('Milk')).toBe(1);
  });

  it('keeps one row per normalized name', () => {
    learnCategoryMapping('Milk', 8);
    learnCategoryMapping('  milk  ', 8);

    const count = getDatabase()
      .prepare('SELECT COUNT(*) as c FROM item_category_mappings')
      .get().c;
    expect(count).toBe(1);
  });
});

describe('updateMappingUsage', () => {
  it('bumps the use count of an existing mapping', () => {
    learnCategoryMapping('Milk', 8);
    updateMappingUsage('Milk');

    expect(mappingFor('milk').use_count).toBe(2);
  });

  it('is a no-op for an unknown name', () => {
    expect(() => updateMappingUsage('Nothing')).not.toThrow();
  });
});

describe('cleanupOldMappings', () => {
  const setLastUsed = (name, iso) =>
    getDatabase()
      .prepare('UPDATE item_category_mappings SET last_used = ? WHERE item_name_lower = ?')
      .run(iso, name);

  it('removes single-use mappings older than six months', () => {
    learnCategoryMapping('Stale', 8);
    setLastUsed('stale', '2000-01-01T00:00:00.000Z');

    expect(cleanupOldMappings()).toBe(1);
    expect(getSuggestedCategory('Stale')).toBeNull();
  });

  it('keeps mappings that are used more than once, however old', () => {
    learnCategoryMapping('Popular', 8);
    learnCategoryMapping('Popular', 8);
    setLastUsed('popular', '2000-01-01T00:00:00.000Z');

    expect(cleanupOldMappings()).toBe(0);
    expect(getSuggestedCategory('Popular')).toBe(8);
  });

  it('keeps recent single-use mappings', () => {
    learnCategoryMapping('Fresh', 8);

    expect(cleanupOldMappings()).toBe(0);
    expect(getSuggestedCategory('Fresh')).toBe(8);
  });
});
