/**
 * Item name normalisation helpers.
 *
 * Used to detect "the same" ingredient when it is typed differently, e.g.
 * "Tomato", "tomatoes" and "TOMATOS" all normalise to "tomato".
 */

/**
 * Reduce a single word to its singular form using simple English rules.
 * @param {string} word
 * @returns {string}
 */
export function singularize(word) {
  if (word.length <= 3) return word;
  if (/[^aeiou]ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|s|x|z|o)es$/.test(word)) return word.slice(0, -2);
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Canonical key for an item name: lowercased, whitespace collapsed and each
 * word singularized.
 * @param {string} name
 * @returns {string}
 */
export function normalizeName(name) {
  return String(name ?? '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map(singularize)
    .join(' ');
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean} true when both names refer to the same ingredient
 */
export function namesMatch(a, b) {
  const key = normalizeName(a);
  return key.length > 0 && key === normalizeName(b);
}
