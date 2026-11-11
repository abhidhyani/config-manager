import { PendingChanges } from './PendingChanges.js';

const PENDING_KEY = 'configManager.pending.v1';

const isChange = (value) =>
  value !== null &&
  typeof value === 'object' &&
  typeof value.fileKey === 'string' &&
  typeof value.key === 'string' &&
  typeof value.value === 'string';

/**
 * Keeps unsent edits across a reload. They are scoped to the repository and branch they were
 * made against: switching either in Settings must not carry edits into a different catalogue.
 */
export class PendingChangesStorage {
  #storage;

  constructor(jsonStorage) {
    this.#storage = jsonStorage;
  }

  load(scope) {
    const stored = this.#storage.read(PENDING_KEY, null);
    if (stored?.scope !== scope || !Array.isArray(stored.changes)) return new PendingChanges();
    return new PendingChanges(stored.changes.filter(isChange));
  }

  save(scope, pending) {
    if (pending.size === 0) {
      this.#storage.remove(PENDING_KEY);
      return;
    }
    this.#storage.write(PENDING_KEY, { scope, changes: pending.list() });
  }
}
