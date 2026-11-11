const SNAKE_CASE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/** Android resource names: letters, digits and underscores, not starting with a digit. */
export const VALID_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isSnakeCase(key) {
  return SNAKE_CASE.test(key);
}

/** Case- and separator-insensitive form, so `reAir_badge` and `re_air_badge` compare equal. */
export function normalizeKey(key) {
  return key.toLowerCase().replace(/[_\-.\s]/g, '');
}

/** Levenshtein distance, giving up (returning `limit + 1`) once it must exceed `limit`. */
export function editDistance(a, b, limit = Infinity) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    let rowMinimum = row;
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      const value = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost);
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/** Two different keys that probably name the same string (a rename, a typo, a casing slip). */
export function areKeysSimilar(a, b) {
  if (a === b) return false;
  if (normalizeKey(a) === normalizeKey(b)) return true;
  const longest = Math.max(a.length, b.length);
  if (longest < 6) return false;
  const distance = editDistance(a, b, 2);
  return distance <= 2 && distance / longest <= 0.25;
}
