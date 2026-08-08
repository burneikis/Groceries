import { addToSyncQueue, getSyncQueue, removeSyncEntry, updateSyncEntry } from './db';
import { ApiError, NetworkError, categoriesApi, itemsApi, mealPlanApi, recipesApi } from './api';

/**
 * Number of times a queued mutation is retried before it is discarded.
 * Only transient failures (5xx, network) count towards this.
 */
const MAX_RETRIES = 5;

/**
 * The single source of truth for offline mutations.
 *
 * Every action the store can queue is declared here together with the call
 * that replays it. Keeping both halves in one place is what prevents the
 * class of bug where the store queues an action nothing knows how to replay.
 *
 * - `run`     replays the mutation against the API.
 * - `refs`    paths inside `data` that hold ids which may be temporary and
 *             therefore need remapping to their real server id before replay.
 * - `creates` marks actions that produce a new server record, so the entry's
 *             `tempId` can be mapped onto the returned id.
 */
const ACTIONS = {
  'categories.create': {
    run: (d, changeId) => categoriesApi.create(d.name, changeId),
    creates: true,
  },
  'categories.update': {
    run: (d, changeId) => categoriesApi.update(d.id, d.name, changeId),
    refs: ['id'],
  },
  'categories.delete': {
    run: (d, changeId) => categoriesApi.delete(d.id, changeId),
    refs: ['id'],
  },
  'categories.reorder': {
    run: (d, changeId) => categoriesApi.reorder(d.categories, changeId),
    refs: ['categories[].id'],
  },
  'items.create': {
    run: (d, changeId) => itemsApi.create(d.item, changeId),
    refs: ['item.category_id'],
    creates: true,
  },
  'items.update': {
    run: (d, changeId) => itemsApi.update(d.id, d.item, changeId),
    refs: ['id', 'item.category_id'],
  },
  'items.toggleCheck': {
    run: (d, changeId) => itemsApi.toggleCheck(d.id, d.checked, changeId),
    refs: ['id'],
  },
  'items.delete': {
    run: (d, changeId) => itemsApi.delete(d.id, changeId),
    refs: ['id'],
  },
  'items.deleteChecked': {
    run: (d, changeId) => itemsApi.deleteChecked(d.ids, changeId),
    refs: ['ids[]'],
  },
  'items.reorder': {
    run: (d, changeId) => itemsApi.reorder(d.items, changeId),
    refs: ['items[].id'],
  },
  'recipes.create': {
    run: (d, changeId) => recipesApi.create(d.recipe, changeId),
    refs: ['recipe.ingredients[].category_id'],
    creates: true,
  },
  'recipes.update': {
    run: (d, changeId) => recipesApi.update(d.id, d.recipe, changeId),
    refs: ['id', 'recipe.ingredients[].category_id'],
  },
  'recipes.delete': {
    run: (d, changeId) => recipesApi.delete(d.id, changeId),
    refs: ['id'],
  },
  'recipes.addToList': {
    run: (d, changeId) => recipesApi.addToList(d.id, changeId),
    refs: ['id'],
  },
  'recipes.removeFromList': {
    run: (d, changeId) => recipesApi.removeFromList(d.id, changeId),
    refs: ['id'],
  },
  'recipes.setRegular': {
    run: (d, changeId) => recipesApi.setRegular(d.id, d.isRegular, changeId),
    refs: ['id'],
  },
  'mealplan.confirm': {
    run: (d, changeId) => mealPlanApi.confirm(d.recipeIds, d.excludedIngredientIds, changeId),
    refs: ['recipeIds[]'],
  },
};

/**
 * Records created while offline get a negative placeholder id so they can be
 * rendered and referenced before the server has seen them.
 * @returns {number} a temporary, collision-free negative id
 */
export function createTempId() {
  return -Date.now() - Math.floor(Math.random() * 1000);
}

export const isTempId = (id) => typeof id === 'number' && id < 0;

/**
 * Queue a mutation for replay once connectivity returns.
 * @param {keyof ACTIONS} action
 * @param {object} data - Arguments for the replayed call
 * @param {number} [tempId] - Placeholder id of a record created offline
 */
export async function queueMutation(action, data, tempId) {
  if (!ACTIONS[action]) {
    throw new Error(`Unknown sync action: ${action}`);
  }
  await addToSyncQueue({ action, data, tempId });
}

/**
 * Rewrite temporary ids at the given path to their real server ids.
 * Supports `a`, `a.b`, `a[]` and `a[].b` paths.
 */
function remapPath(data, path, idMap) {
  const [head, ...rest] = path.split('.');

  if (head.endsWith('[]')) {
    const key = head.slice(0, -2);
    const list = data?.[key];
    if (!Array.isArray(list)) return;

    if (rest.length === 0) {
      data[key] = list.map((value) => (idMap.has(value) ? idMap.get(value) : value));
    } else {
      list.forEach((entry) => remapPath(entry, rest.join('.'), idMap));
    }
    return;
  }

  if (rest.length > 0) {
    remapPath(data?.[head], rest.join('.'), idMap);
    return;
  }

  if (data && idMap.has(data[head])) {
    data[head] = idMap.get(data[head]);
  }
}

/**
 * @returns {boolean} true if every temp id in the entry could be resolved
 */
function resolveRefs(entry, idMap) {
  for (const path of ACTIONS[entry.action].refs ?? []) {
    remapPath(entry.data, path, idMap);
  }
  return !containsTempId(entry.data);
}

function containsTempId(value) {
  if (Array.isArray(value)) return value.some(containsTempId);
  if (value && typeof value === 'object') return Object.values(value).some(containsTempId);
  return isTempId(value);
}

const generateChangeId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

let syncing = false;

/**
 * Replay every queued mutation in order.
 *
 * Stops at the first network failure so ordering is preserved and nothing is
 * lost; transient server errors are retried on later runs; only permanent
 * (4xx) failures or entries exceeding MAX_RETRIES are discarded.
 *
 * @param {(changeId: string) => void} [trackOwnChange] - Lets the caller
 *   suppress the SSE echo of its own replayed changes.
 * @returns {Promise<{synced: number, failed: number, remaining: number}>}
 */
export async function processQueue(trackOwnChange) {
  if (syncing) return { synced: 0, failed: 0, remaining: 0 };
  syncing = true;

  const idMap = new Map();
  let synced = 0;
  let failed = 0;

  try {
    const queue = await getSyncQueue();

    for (const entry of queue) {
      const action = ACTIONS[entry.action];
      if (!action) {
        console.error(`[Sync] Dropping entry with unknown action: ${entry.action}`);
        await removeSyncEntry(entry.id);
        failed++;
        continue;
      }

      if (!resolveRefs(entry, idMap)) {
        console.error(`[Sync] Dropping ${entry.action}: references a record that was never created`);
        await removeSyncEntry(entry.id);
        failed++;
        continue;
      }

      const changeId = generateChangeId();
      trackOwnChange?.(changeId);

      try {
        const result = await action.run(entry.data, changeId);

        // Map the placeholder id onto the real one for later entries.
        if (action.creates && entry.tempId != null && result?.id != null) {
          idMap.set(entry.tempId, result.id);
        }

        await removeSyncEntry(entry.id);
        synced++;
      } catch (error) {
        if (error instanceof NetworkError) {
          // Still offline. Keep this and everything after it for the next run.
          break;
        }

        if (error instanceof ApiError && error.isPermanent) {
          console.warn(`[Sync] Dropping ${entry.action}: ${error.message}`);
          await removeSyncEntry(entry.id);
          failed++;
          continue;
        }

        const retries = (entry.retries ?? 0) + 1;
        if (retries >= MAX_RETRIES) {
          console.error(`[Sync] Giving up on ${entry.action} after ${retries} attempts:`, error);
          await removeSyncEntry(entry.id);
          failed++;
        } else {
          await updateSyncEntry({ ...entry, retries });
          break; // Preserve ordering; retry from here on the next run.
        }
      }
    }
  } finally {
    syncing = false;
  }

  const remaining = (await getSyncQueue()).length;
  return { synced, failed, remaining };
}

/**
 * Flush the queue whenever connectivity returns.
 * @param {() => void} onSyncComplete - Called after a flush attempt
 * @param {(changeId: string) => void} [trackOwnChange]
 * @returns {() => void} cleanup function
 */
export function startSyncListener(onSyncComplete, trackOwnChange) {
  const handleOnline = async () => {
    const result = await processQueue(trackOwnChange);
    onSyncComplete?.(result);
  };

  window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
}
