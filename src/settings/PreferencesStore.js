import { DEFAULT_ENVIRONMENT_ID, getEnvironment } from '../app/AppRegistry.js';

const PREFERENCES_KEY = 'configManager.preferences.v1';
export const PAGE_SIZES = Object.freeze([50, 100, 250]);

export function createDefaultPreferences() {
  return {
    environment: DEFAULT_ENVIRONMENT_ID,
    dashboardTab: 'strings',
    statusFilter: 'all',
    hiddenIssueTypes: [],
    pageSize: PAGE_SIZES[0],
  };
}

/** Which environment, tab and filters the user last had open; purely cosmetic, never credentials. */
export class PreferencesStore {
  #storage;

  constructor(jsonStorage) {
    this.#storage = jsonStorage;
  }

  load() {
    const defaults = createDefaultPreferences();
    const stored = this.#storage.read(PREFERENCES_KEY, null);
    if (stored === null || typeof stored !== 'object') return defaults;
    return {
      environment: getEnvironment(stored.environment) ? stored.environment : defaults.environment,
      dashboardTab: stored.dashboardTab === 'issues' ? 'issues' : defaults.dashboardTab,
      statusFilter: typeof stored.statusFilter === 'string' ? stored.statusFilter : defaults.statusFilter,
      hiddenIssueTypes: Array.isArray(stored.hiddenIssueTypes)
        ? stored.hiddenIssueTypes.filter((type) => typeof type === 'string')
        : defaults.hiddenIssueTypes,
      pageSize: PAGE_SIZES.includes(stored.pageSize) ? stored.pageSize : defaults.pageSize,
    };
  }

  save(preferences) {
    this.#storage.write(PREFERENCES_KEY, preferences);
  }
}
