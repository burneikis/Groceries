import { getSyncQueue, removeSyncEntry } from './db';
import { categoriesApi, itemsApi, recipesApi } from './api';

const apiMap = {
  'categories.create': (d) => categoriesApi.create(d.name),
  'categories.update': (d) => categoriesApi.update(d.id, d.name),
  'categories.delete': (d) => categoriesApi.delete(d.id),
  'categories.reorder': (d) => categoriesApi.reorder(d.categories),
  'items.create': (d) => itemsApi.create(d.item),
  'items.update': (d) => itemsApi.update(d.id, d.item),
  'items.toggleCheck': (d) => itemsApi.toggleCheck(d.id, d.checked),
  'items.delete': (d) => itemsApi.delete(d.id),
  'items.deleteChecked': () => itemsApi.deleteChecked(),
  'recipes.create': (d) => recipesApi.create(d.recipe),
  'recipes.update': (d) => recipesApi.update(d.id, d.recipe),
  'recipes.delete': (d) => recipesApi.delete(d.id),
  'recipes.addToList': (d) => recipesApi.addToList(d.id),
};

let syncing = false;

export async function processQueue() {
  if (syncing || !navigator.onLine) return;
  syncing = true;

  try {
    const queue = await getSyncQueue();
    for (const entry of queue) {
      const handler = apiMap[entry.action];
      if (!handler) {
        await removeSyncEntry(entry.id);
        continue;
      }
      try {
        await handler(entry.data);
        await removeSyncEntry(entry.id);
      } catch (err) {
        // If it's a network error, stop processing - we're offline again
        if (!navigator.onLine) break;
        // For other errors (e.g. 404 on deleted resource), skip the entry
        console.warn(`Sync failed for ${entry.action}:`, err.message);
        await removeSyncEntry(entry.id);
      }
    }
  } finally {
    syncing = false;
  }
}

export function startSyncListener(onSyncComplete) {
  const handleOnline = async () => {
    await processQueue();
    onSyncComplete?.();
  };

  window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
}
