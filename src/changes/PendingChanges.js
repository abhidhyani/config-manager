const idOf = (fileKey, key) => `${fileKey}\u0000${key}`;

/**
 * The user's uncommitted edits, one value per (file, key).
 *
 * Deliberately stores only the intent (the value to write), never "before" or "add vs update":
 * those are derived from the freshly loaded catalogue, so they cannot go stale when the
 * base branch moves.
 */
export class PendingChanges {
  #changes = new Map();

  constructor(initial = []) {
    for (const change of initial) this.upsert(change);
  }

  get size() {
    return this.#changes.size;
  }

  has(fileKey, key) {
    return this.#changes.has(idOf(fileKey, key));
  }

  get(fileKey, key) {
    return this.#changes.get(idOf(fileKey, key)) ?? null;
  }

  upsert({ fileKey, key, value }) {
    this.#changes.set(idOf(fileKey, key), { fileKey, key, value });
  }

  remove(fileKey, key) {
    return this.#changes.delete(idOf(fileKey, key));
  }

  clear() {
    this.#changes.clear();
  }

  list() {
    return [...this.#changes.values()];
  }

  forFile(fileKey) {
    return this.list().filter((change) => change.fileKey === fileKey);
  }

  toJSON() {
    return this.list();
  }
}
