import { createDefaultSettings } from './SettingsDefaults.js';
import { normalizeSettings } from './settingsValidation.js';

const SETTINGS_KEY = 'configManager.settings.v1';

/** Merges whatever was stored over the defaults, so a new setting never reads as undefined. */
export function mergeWithDefaults(stored) {
  const defaults = createDefaultSettings();
  if (stored === null || typeof stored !== 'object') return defaults;
  const pick = (value, fallback) => (typeof value === 'string' ? value : fallback);
  return {
    repository: pick(stored.repository, defaults.repository),
    branch: pick(stored.branch, defaults.branch),
    basePath: pick(stored.basePath, defaults.basePath),
    directories: Object.fromEntries(
      Object.entries(defaults.directories).map(([id, fallback]) => [id, pick(stored.directories?.[id], fallback)]),
    ),
    fileNames: Object.fromEntries(
      Object.entries(defaults.fileNames).map(([id, fallback]) => [id, pick(stored.fileNames?.[id], fallback)]),
    ),
    jiraBaseUrl: pick(stored.jiraBaseUrl, defaults.jiraBaseUrl),
  };
}

/** Repository, branch and path settings, persisted so they are entered once per browser. */
export class SettingsStore {
  #storage;

  constructor(jsonStorage) {
    this.#storage = jsonStorage;
  }

  load() {
    return mergeWithDefaults(this.#storage.read(SETTINGS_KEY, null));
  }

  save(settings) {
    const normalized = normalizeSettings(settings);
    this.#storage.write(SETTINGS_KEY, normalized);
    return normalized;
  }
}
