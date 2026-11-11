export class CatalogParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CatalogParseError';
  }
}

const isWhitespace = (char) => char === ' ' || char === '\t' || char === '\n' || char === '\r';

/** Reads a JSON string token starting at `start` (which must be a double quote). */
function readString(text, start) {
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') {
      index += 2;
    } else if (char === '"') {
      return { value: JSON.parse(text.slice(start, index + 1)), end: index + 1 };
    } else {
      index += 1;
    }
  }
  throw new CatalogParseError('Unterminated string.');
}

/** Skips any JSON value starting at `start` and returns the index just after it. */
function skipValue(text, start) {
  const first = text[start];
  if (first === '"') {
    return readString(text, start).end;
  }
  if (first === '{' || first === '[') {
    let depth = 0;
    let index = start;
    while (index < text.length) {
      const char = text[index];
      if (char === '"') {
        index = readString(text, index).end;
        continue;
      }
      if (char === '{' || char === '[') depth += 1;
      if (char === '}' || char === ']') depth -= 1;
      index += 1;
      if (depth === 0) return index;
    }
    throw new CatalogParseError('Unterminated object or array.');
  }
  let index = start;
  while (index < text.length && !isWhitespace(text[index]) && text[index] !== ',' && text[index] !== '}') {
    index += 1;
  }
  return index;
}

/**
 * Lists the top-level keys of an already-validated JSON object in source order.
 *
 * `JSON.parse` silently keeps the last of two equal keys and reorders integer-like keys, so the
 * order and the duplicates can only be recovered from the text itself.
 */
export function scanTopLevelKeys(text) {
  const orderedKeys = [];
  const seen = new Set();
  const duplicates = new Set();
  let index = 0;

  const skipWhitespace = () => {
    while (index < text.length && isWhitespace(text[index])) index += 1;
  };

  skipWhitespace();
  index += 1; // opening brace
  skipWhitespace();
  if (text[index] === '}') return { orderedKeys, duplicates: [] };

  while (index < text.length) {
    skipWhitespace();
    const { value: key, end } = readString(text, index);
    index = end;
    if (seen.has(key)) {
      duplicates.add(key);
    } else {
      seen.add(key);
      orderedKeys.push(key);
    }
    skipWhitespace();
    index += 1; // colon
    skipWhitespace();
    index = skipValue(text, index);
    skipWhitespace();
    if (text[index] === ',') {
      index += 1;
      continue;
    }
    break;
  }
  return { orderedKeys, duplicates: [...duplicates] };
}

/** Parses a string catalogue into ordered entries plus the problems JSON.parse would hide. */
export function parseCatalogText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new CatalogParseError(`Invalid JSON: ${error.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CatalogParseError('Expected a JSON object of "key": "value" pairs.');
  }
  const { orderedKeys, duplicates } = scanTopLevelKeys(text);
  const entries = new Map();
  for (const key of orderedKeys) {
    entries.set(key, parsed[key]);
  }
  return { entries, duplicateKeys: duplicates };
}
