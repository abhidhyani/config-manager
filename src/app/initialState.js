import { IssueIndex } from '../analysis/IssueIndex.js';
import { createDefaultPreferences } from '../settings/PreferencesStore.js';
import { createDefaultSettings } from '../settings/SettingsDefaults.js';

export function createInitialState() {
  return {
    view: 'dashboard',
    settings: createDefaultSettings(),
    preferences: createDefaultPreferences(),
    hasToken: false,
    rememberToken: false,
    load: { status: 'idle', error: null, loadedAt: null, commitSha: '' },
    baseCatalogs: new Map(),
    failures: [],
    pending: [],
    resolved: [],
    effectiveCatalogs: new Map(),
    issues: [],
    issueIndex: new IssueIndex([]),
    search: '',
    page: 1,
  };
}
