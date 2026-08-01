import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

/**
 * Node ships an experimental `localStorage` global that shadows jsdom's and
 * throws unless the process was started with `--localstorage-file`. Replace it
 * with a predictable in-memory implementation for every test.
 */
function installLocalStorage() {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  });
}

/** jsdom does not implement matchMedia, which the theme code relies on. */
function installMatchMedia() {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    });
  }
}

beforeEach(() => {
  installLocalStorage();
  installMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
