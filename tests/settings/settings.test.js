import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listFileTargets, resolveFilePath } from '../../src/app/filePaths.js';
import { JsonStorage, MemoryStorage, SafeStorage } from '../../src/storage/BrowserStorage.js';
import { createDefaultSettings } from '../../src/settings/SettingsDefaults.js';
import { PreferencesStore } from '../../src/settings/PreferencesStore.js';
import { SettingsStore } from '../../src/settings/SettingsStore.js';
import { TokenStore } from '../../src/settings/TokenStore.js';
import { normalizeSettings, parseRepositoryInput, validateSettings } from '../../src/settings/settingsValidation.js';

describe('default file layout', () => {
  it('points at the six real catalogue files of product-client-config', () => {
    const paths = Object.fromEntries(listFileTargets(createDefaultSettings()).map((t) => [t.fileKey, t.path]));

    assert.deepEqual(paths, {
      'usa:qa': 'foxplus/android/lang/v2/en-US/strings_qa.json',
      'usa:prod': 'foxplus/android/lang/v2/en-US/strings.json',
      'mexico:qa': 'foxplus/android/lang/v2/es-MX/strings_qa.json',
      'mexico:prod': 'foxplus/android/lang/v2/es-MX/strings.json',
      'nation:qa': 'foxplus/android/foxnation/lang/v2/en-US/strings_qa.json',
      'nation:prod': 'foxplus/android/foxnation/lang/v2/en-US/strings.json',
    });
  });

  it('follows the base path when it is changed, tolerating stray slashes', () => {
    const settings = { ...createDefaultSettings(), basePath: '/other//root/' };

    assert.equal(resolveFilePath(settings, 'nation', 'prod'), 'other/root/foxnation/lang/v2/en-US/strings.json');
  });
});

describe('parseRepositoryInput', () => {
  it('accepts owner/repo', () => {
    assert.deepEqual(parseRepositoryInput('foxcorp-product/product-client-config'), {
      owner: 'foxcorp-product',
      repo: 'product-client-config',
    });
  });

  it('extracts repository, branch and base path from a pasted GitHub tree URL', () => {
    assert.deepEqual(
      parseRepositoryInput('https://github.com/foxcorp-product/product-client-config/tree/develop/foxplus/android'),
      { owner: 'foxcorp-product', repo: 'product-client-config', branch: 'develop', path: 'foxplus/android' },
    );
  });

  it('accepts a plain repository URL with .git or a trailing slash, and an SSH remote', () => {
    assert.deepEqual(parseRepositoryInput('https://github.com/o/r.git'), { owner: 'o', repo: 'r' });
    assert.deepEqual(parseRepositoryInput('https://github.com/o/r/'), { owner: 'o', repo: 'r' });
    assert.deepEqual(parseRepositoryInput('git@github.com:o/r.git'), { owner: 'o', repo: 'r' });
  });

  it('rejects anything else', () => {
    assert.equal(parseRepositoryInput(''), null);
    assert.equal(parseRepositoryInput('just-a-word'), null);
    assert.equal(parseRepositoryInput('https://example.com/o/r'), null);
  });
});

describe('validateSettings', () => {
  it('accepts the defaults', () => {
    assert.deepEqual(validateSettings(createDefaultSettings()), { valid: true, errors: {} });
  });

  it('reports each bad field against its own name', () => {
    const settings = {
      ...createDefaultSettings(),
      repository: 'not a repo',
      branch: 'bad branch',
      basePath: '../escape',
      directories: { usa: '', mexico: 'lang/../x', nation: 'ok' },
      fileNames: { qa: 'strings_qa', prod: 'dir/strings.json' },
      jiraBaseUrl: 'nope',
    };

    const { valid, errors } = validateSettings(settings);

    assert.equal(valid, false);
    assert.deepEqual(Object.keys(errors).sort(), [
      'basePath',
      'branch',
      'directories.mexico',
      'directories.usa',
      'fileNames.prod',
      'fileNames.qa',
      'jiraBaseUrl',
      'repository',
    ]);
  });

  it('allows an empty base path (files at the repository root) and an empty Jira URL', () => {
    assert.equal(validateSettings({ ...createDefaultSettings(), basePath: '', jiraBaseUrl: '' }).valid, true);
  });
});

describe('SettingsStore', () => {
  const create = () => {
    const backend = new MemoryStorage();
    return { backend, store: new SettingsStore(new JsonStorage(backend)) };
  };

  it('starts with the defaults for a first-time visitor', () => {
    assert.deepEqual(create().store.load(), createDefaultSettings());
  });

  it('remembers saved settings on the next visit, normalised', () => {
    const { backend, store } = create();
    store.save({ ...createDefaultSettings(), repository: ' org/repo ', basePath: '/a//b/' });

    const reloaded = new SettingsStore(new JsonStorage(backend)).load();

    assert.equal(reloaded.repository, 'org/repo');
    assert.equal(reloaded.basePath, 'a/b');
  });

  it('fills settings added in a later version from the defaults', () => {
    const { backend, store } = create();
    backend.setItem('configManager.settings.v1', JSON.stringify({ repository: 'org/repo' }));

    const loaded = store.load();

    assert.equal(loaded.repository, 'org/repo');
    assert.equal(loaded.branch, 'develop');
    assert.equal(loaded.directories.nation, 'foxnation/lang/v2/en-US');
  });

  it('survives corrupt stored data', () => {
    const { backend, store } = create();
    backend.setItem('configManager.settings.v1', '{not json');

    assert.deepEqual(store.load(), createDefaultSettings());
  });

  it('normalises whitespace in every field it stores', () => {
    const normalized = normalizeSettings({ ...createDefaultSettings(), branch: '  main ', fileNames: { qa: ' a.json ', prod: 'b.json' } });

    assert.equal(normalized.branch, 'main');
    assert.equal(normalized.fileNames.qa, 'a.json');
  });
});

describe('TokenStore', () => {
  const create = () => {
    const session = new MemoryStorage();
    const local = new MemoryStorage();
    return { session, local, store: new TokenStore({ session, local }) };
  };

  it('keeps the token for the tab only by default, never on disk', () => {
    const { local, store } = create();

    store.set('ghp_abc');

    assert.equal(store.get(), 'ghp_abc');
    assert.equal(local.getItem('configManager.githubToken'), null);
    assert.equal(store.isRemembered(), false);
  });

  it('survives a new tab only when the user opted in to remember it', () => {
    const { local, store } = create();
    store.set('ghp_abc', { remember: true });

    const newTab = new TokenStore({ session: new MemoryStorage(), local });

    assert.equal(newTab.get(), 'ghp_abc');
    assert.equal(newTab.isRemembered(), true);
  });

  it('removes the stored copy when remember is switched off', () => {
    const { local, store } = create();
    store.set('ghp_abc', { remember: true });

    store.set('ghp_abc', { remember: false });

    assert.equal(local.getItem('configManager.githubToken'), null);
  });

  it('trims the token and treats a blank one as signing out', () => {
    const { store } = create();
    store.set('  ghp_abc  ');
    assert.equal(store.get(), 'ghp_abc');

    store.set('   ');
    assert.equal(store.get(), '');
  });

  it('clears both copies', () => {
    const { store } = create();
    store.set('ghp_abc', { remember: true });

    store.clear();

    assert.equal(store.get(), '');
    assert.equal(store.isRemembered(), false);
  });
});

describe('SafeStorage', () => {
  const throwing = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('quota');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };

  it('keeps working in memory when the browser blocks storage', () => {
    const storage = new SafeStorage(throwing);

    storage.setItem('k', 'v');

    assert.equal(storage.getItem('k'), 'v');
    storage.removeItem('k');
    assert.equal(storage.getItem('k'), null);
  });
});

describe('PreferencesStore', () => {
  it('ignores values that are no longer valid choices', () => {
    const backend = new MemoryStorage();
    backend.setItem(
      'configManager.preferences.v1',
      JSON.stringify({ environment: 'moon', dashboardTab: 'x', pageSize: 7, hiddenIssueTypes: ['untranslated', 5] }),
    );

    const loaded = new PreferencesStore(new JsonStorage(backend)).load();

    assert.equal(loaded.environment, 'qa');
    assert.equal(loaded.dashboardTab, 'strings');
    assert.equal(loaded.pageSize, 50);
    assert.deepEqual(loaded.hiddenIssueTypes, ['untranslated']);
  });

  it('round-trips the environment the user last chose', () => {
    const store = new PreferencesStore(new JsonStorage(new MemoryStorage()));
    store.save({ ...store.load(), environment: 'prod' });

    assert.equal(store.load().environment, 'prod');
  });
});
