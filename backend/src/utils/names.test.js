import { describe, expect, it } from 'vitest';
import { namesMatch, normalizeName, singularize } from './names.js';

describe('singularize', () => {
  it.each([
    ['tomatoes', 'tomato'],
    ['berries', 'berry'],
    ['boxes', 'box'],
    ['apples', 'apple'],
    ['glass', 'glass'],
    ['egg', 'egg'],
    ['gas', 'gas']
  ])('%s -> %s', (input, expected) => {
    expect(singularize(input)).toBe(expected);
  });
});

describe('normalizeName', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(normalizeName('  Green   Apples ')).toBe('green apple');
  });

  it('handles nullish input', () => {
    expect(normalizeName(null)).toBe('');
  });
});

describe('namesMatch', () => {
  it('matches across case and plurals', () => {
    expect(namesMatch('Tomato', 'TOMATOES')).toBe(true);
  });

  it('does not match empty names', () => {
    expect(namesMatch('', '')).toBe(false);
  });

  it('does not match different ingredients', () => {
    expect(namesMatch('Milk', 'Bread')).toBe(false);
  });
});
