import { openDB } from 'idb';

const DB_NAME = 'groceries';
const DB_VERSION = 2;

let dbPromise;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('categories')) {
          db.createObjectStore('categories', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('items')) {
          db.createObjectStore('items', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('recipes')) {
          db.createObjectStore('recipes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('recurring')) {
          db.createObjectStore('recurring', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
}

// Categories
export async function getCategories() {
  const db = await getDB();
  const categories = await db.getAll('categories');
  return categories.sort((a, b) => a.sort_order - b.sort_order);
}

export async function saveCategories(categories) {
  const db = await getDB();
  const tx = db.transaction('categories', 'readwrite');
  await tx.store.clear();
  for (const cat of categories) {
    await tx.store.put(cat);
  }
  await tx.done;
}

// Items
export async function getItems() {
  const db = await getDB();
  return db.getAll('items');
}

export async function saveItems(items) {
  const db = await getDB();
  const tx = db.transaction('items', 'readwrite');
  await tx.store.clear();
  for (const item of items) {
    await tx.store.put(item);
  }
  await tx.done;
}

export async function saveItem(item) {
  const db = await getDB();
  await db.put('items', item);
}

export async function deleteItemLocal(id) {
  const db = await getDB();
  await db.delete('items', id);
}

export async function deleteCheckedItemsLocal() {
  const db = await getDB();
  const tx = db.transaction('items', 'readwrite');
  const items = await tx.store.getAll();
  for (const item of items) {
    if (item.checked) {
      await tx.store.delete(item.id);
    }
  }
  await tx.done;
}

// Recipes
export async function getRecipes() {
  const db = await getDB();
  return db.getAll('recipes');
}

export async function saveRecipes(recipes) {
  const db = await getDB();
  const tx = db.transaction('recipes', 'readwrite');
  await tx.store.clear();
  for (const recipe of recipes) {
    await tx.store.put(recipe);
  }
  await tx.done;
}

export async function saveRecipe(recipe) {
  const db = await getDB();
  await db.put('recipes', recipe);
}

export async function deleteRecipeLocal(id) {
  const db = await getDB();
  await db.delete('recipes', id);
}

// Recurring items
export async function getRecurringItems() {
  const db = await getDB();
  return db.getAll('recurring');
}

export async function saveRecurringItems(recurringItems) {
  const db = await getDB();
  const tx = db.transaction('recurring', 'readwrite');
  await tx.store.clear();
  for (const recurring of recurringItems) {
    await tx.store.put(recurring);
  }
  await tx.done;
}

export async function saveRecurringItem(recurring) {
  const db = await getDB();
  await db.put('recurring', recurring);
}

export async function deleteRecurringItemLocal(id) {
  const db = await getDB();
  await db.delete('recurring', id);
}

// Sync Queue
// Entries are replayed in insertion order (autoIncrement key) once back online.
export async function addToSyncQueue(entry) {
  const db = await getDB();
  return db.add('syncQueue', {
    ...entry,
    retries: 0,
    timestamp: Date.now(),
  });
}

export async function getSyncQueue() {
  const db = await getDB();
  return db.getAll('syncQueue');
}

/** Persist changes to a queued entry (retry counter, remapped ids). */
export async function updateSyncEntry(entry) {
  const db = await getDB();
  await db.put('syncQueue', entry);
}

export async function countSyncQueue() {
  const db = await getDB();
  return db.count('syncQueue');
}

export async function clearSyncQueue() {
  const db = await getDB();
  const tx = db.transaction('syncQueue', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

export async function removeSyncEntry(id) {
  const db = await getDB();
  await db.delete('syncQueue', id);
}
