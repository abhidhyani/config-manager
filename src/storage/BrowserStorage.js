/** In-memory stand-in with the same surface as `Storage`; used when the browser blocks storage. */
export class MemoryStorage {
  #items = new Map();

  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null;
  }

  setItem(key, value) {
    this.#items.set(key, String(value));
  }

  removeItem(key) {
    this.#items.delete(key);
  }
}

/**
 * `localStorage` / `sessionStorage` throw on access in some privacy modes and when the quota is
 * exhausted. Wrapping them keeps the app usable (just not persistent) instead of crashing.
 */
export class SafeStorage {
  #backend;
  #fallback = new MemoryStorage();

  constructor(backend) {
    this.#backend = backend;
  }

  getItem(key) {
    try {
      return this.#backend.getItem(key);
    } catch {
      return this.#fallback.getItem(key);
    }
  }

  setItem(key, value) {
    try {
      this.#backend.setItem(key, value);
    } catch {
      this.#fallback.setItem(key, value);
    }
  }

  removeItem(key) {
    try {
      this.#backend.removeItem(key);
    } catch {
      this.#fallback.removeItem(key);
    }
    this.#fallback.removeItem(key);
  }
}

function browserBackend(kind) {
  try {
    return kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function createBrowserStorage(kind) {
  return new SafeStorage(browserBackend(kind) ?? new MemoryStorage());
}

/** JSON on top of any `Storage`-shaped object; corrupt or missing data yields the fallback. */
export class JsonStorage {
  #storage;

  constructor(storage) {
    this.#storage = storage;
  }

  read(key, fallback) {
    const raw = this.#storage.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  write(key, value) {
    this.#storage.setItem(key, JSON.stringify(value));
  }

  remove(key) {
    this.#storage.removeItem(key);
  }
}
