import { openDB } from 'idb';

const DB_NAME = 'groceries';
const DB_VERSION = 1;

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

// Sync Queue
export async function addToSyncQueue(entry) {
  const db = await getDB();
  await db.add('syncQueue', {
    ...entry,
    timestamp: Date.now(),
  });
}

export async function getSyncQueue() {
  const db = await getDB();
  return db.getAll('syncQueue');
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
