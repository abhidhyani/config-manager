import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppController } from '../../src/app/AppController.js';
import { AppState } from '../../src/app/AppState.js';
import { listFileTargets } from '../../src/app/filePaths.js';
import { createInitialState } from '../../src/app/initialState.js';
import { PendingChangesStorage } from '../../src/changes/PendingChangesStorage.js';
import { GitHubError } from '../../src/github/GitHubError.js';
import { PullRequestPublisher } from '../../src/github/PullRequestPublisher.js';
import { RepositoryReader } from '../../src/github/RepositoryReader.js';
import { PreferencesStore } from '../../src/settings/PreferencesStore.js';
import { createDefaultSettings } from '../../src/settings/SettingsDefaults.js';
import { SettingsStore } from '../../src/settings/SettingsStore.js';
import { TokenStore } from '../../src/settings/TokenStore.js';
import { JsonStorage, MemoryStorage } from '../../src/storage/BrowserStorage.js';
import { FakeGitHub } from '../helpers/FakeGitHub.js';

const DEFAULT_REPOSITORY = createDefaultSettings().repository;
const TOKEN_KEY = 'configManager.githubToken';

const serialize = (entries, indent = '  ') =>
  `{\n${Object.entries(entries).map(([k, v]) => `${indent}${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`;

const pathOf = (fileKey) => listFileTargets(createDefaultSettings()).find((target) => target.fileKey === fileKey).path;

/** The six real catalogue paths, with Nation one key short of the others. */
function repositoryFiles() {
  const files = {};
  for (const target of listFileTargets(createDefaultSettings())) {
    const entries = { greeting: `hi-${target.appId}`, shared_title: `title-${target.appId}` };
    if (target.appId !== 'nation') entries.only_in_usa_and_mexico = `x-${target.appId}`;
    files[target.path] = serialize(entries);
  }
  return files;
}

function setup({ token = 'ghp_token', files = repositoryFiles() } = {}) {
  const [owner, repo] = DEFAULT_REPOSITORY.split('/');
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const github = new FakeGitHub({ files, owner, repo });
  const state = new AppState(createInitialState());
  const tokenStore = new TokenStore({ session, local });
  if (token) tokenStore.set(token);
  const stores = {
    settingsStore: new SettingsStore(new JsonStorage(local)),
    tokenStore,
    preferencesStore: new PreferencesStore(new JsonStorage(local)),
    pendingStorage: new PendingChangesStorage(new JsonStorage(local)),
  };
  const create = () =>
    new AppController({
      state,
      ...stores,
      now: () => new Date('2026-11-05T13:30:45.123Z'),
      createGitHub: (_token, coordinates) => {
        const reader = new RepositoryReader(github, coordinates);
        return { reader, publisher: new PullRequestPublisher(github, reader, coordinates) };
      },
    });
  return { local, github, state, stores, controller: create(), create };
}

async function startedSetup(options) {
  const ctx = setup(options);
  await ctx.controller.start();
  return ctx;
}

describe('AppController start-up', () => {
  it('opens Settings and loads nothing when there is no token yet', async () => {
    const { controller, state, github } = setup({ token: '' });

    await controller.start();

    assert.equal(state.get().view, 'settings');
    assert.equal(state.get().load.status, 'idle');
    assert.equal(github.calls.length, 0);
  });

  it('loads all six catalogues from one commit and flags the string Nation is missing', async () => {
    const { state } = await startedSetup();

    const { load, baseCatalogs, issues } = state.get();
    assert.equal(load.status, 'ready');
    assert.equal(load.commitSha, 'base-sha');
    assert.equal(baseCatalogs.size, 6);
    assert.deepEqual(
      issues.filter((issue) => issue.type === 'missing-key').map((issue) => `${issue.envId}:${issue.appId}:${issue.key}`).sort(),
      ['prod:nation:only_in_usa_and_mexico', 'qa:nation:only_in_usa_and_mexico'],
    );
  });

  it('reports a rejected token instead of showing an empty dashboard', async () => {
    const { controller, state, github } = setup();
    github.failOn('GET', new GitHubError({ kind: 'auth', status: 401, message: 'Token rejected.' }));

    await controller.start();

    assert.equal(state.get().load.status, 'error');
    assert.equal(state.get().load.error.kind, 'auth');
    assert.equal(state.get().load.error.message, 'Token rejected.');
  });

  it('treats a load where no file could be read as an error, not an empty success', async () => {
    const { state } = await startedSetup({ files: {} });

    assert.equal(state.get().load.status, 'error');
    assert.match(state.get().load.error.message, /None of the string files could be loaded/);
  });

  it('still compares the files that did load when one is missing', async () => {
    const files = repositoryFiles();
    delete files[pathOf('nation:qa')];

    const { state } = await startedSetup({ files });

    assert.equal(state.get().load.status, 'ready');
    assert.equal(state.get().baseCatalogs.size, 5);
    assert.deepEqual(state.get().failures.map((failure) => failure.target.fileKey), ['nation:qa']);
    assert.ok(state.get().issues.some((issue) => issue.type === 'file-unavailable'));
  });
});

describe('AppController pending changes', () => {
  const missingKeyEnvs = (state) =>
    state.get().issues.filter((issue) => issue.type === 'missing-key').map((issue) => issue.envId);

  it('shows the effect of a pending change immediately: adding the missing string resolves the issue', async () => {
    const { controller, state } = await startedSetup();
    assert.deepEqual(missingKeyEnvs(state).sort(), ['prod', 'qa']);

    controller.stageChanges([{ fileKey: 'nation:qa', key: 'only_in_usa_and_mexico', value: 'x-nation' }]);

    assert.deepEqual(missingKeyEnvs(state), ['prod']);
    assert.equal(state.get().effectiveCatalogs.get('nation:qa').get('only_in_usa_and_mexico'), 'x-nation');
    assert.equal(state.get().baseCatalogs.get('nation:qa').has('only_in_usa_and_mexico'), false);
  });

  it('cancels a pending edit when the value is set back to what was loaded', async () => {
    const { controller, state } = await startedSetup();
    controller.stageChanges([{ fileKey: 'usa:qa', key: 'greeting', value: 'changed' }]);
    assert.equal(state.get().pending.length, 1);

    controller.stageChanges([{ fileKey: 'usa:qa', key: 'greeting', value: 'hi-usa' }]);

    assert.equal(state.get().pending.length, 0);
  });

  it('removes one change or all of them', async () => {
    const { controller, state } = await startedSetup();
    controller.stageChanges([
      { fileKey: 'usa:qa', key: 'greeting', value: 'a' },
      { fileKey: 'mexico:qa', key: 'greeting', value: 'b' },
    ]);

    controller.removePending('usa:qa', 'greeting');
    assert.deepEqual(state.get().pending.map((change) => change.fileKey), ['mexico:qa']);
    controller.clearPending();
    assert.equal(state.get().pending.length, 0);
  });

  it('restores unsent edits after a reload for the same repository and branch', async () => {
    const { controller, create, state } = await startedSetup();
    controller.stageChanges([{ fileKey: 'usa:qa', key: 'greeting', value: 'kept' }]);

    await create().start();

    assert.deepEqual(state.get().pending, [{ fileKey: 'usa:qa', key: 'greeting', value: 'kept' }]);
    assert.equal(state.get().effectiveCatalogs.get('usa:qa').get('greeting'), 'kept');
  });

  it('drafts a pull request from the pending changes', async () => {
    const { controller } = await startedSetup();
    controller.stageChanges([{ fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' }]);

    const draft = controller.draftPullRequest('DTCAND-9');

    assert.equal(draft.title, 'DTCAND-9: Update string `greeting` for FOX One USA (QA)');
  });
});

describe('AppController settings', () => {
  it('refuses invalid settings without saving or changing anything', async () => {
    const { controller, state, stores } = await startedSetup();

    const result = await controller.saveSettings({
      settings: { ...createDefaultSettings(), repository: 'not valid' },
      token: 'ghp_other',
      remember: false,
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.repository);
    assert.equal(stores.settingsStore.load().repository, DEFAULT_REPOSITORY);
    assert.equal(state.get().settings.repository, DEFAULT_REPOSITORY);
    assert.equal(controller.currentToken(), 'ghp_token');
  });

  it('saves valid settings, keeps the token out of localStorage by default, and reloads', async () => {
    const { controller, state, local, github, stores } = await startedSetup({ token: '' });
    github.baseBranch = 'release';

    const result = await controller.saveSettings({
      settings: { ...createDefaultSettings(), branch: 'release' },
      token: 'ghp_new',
      remember: false,
    });

    assert.equal(result.ok, true);
    assert.equal(state.get().view, 'dashboard');
    assert.equal(state.get().load.status, 'ready');
    assert.equal(stores.settingsStore.load().branch, 'release');
    assert.equal(local.getItem(TOKEN_KEY), null);
    assert.equal(state.get().rememberToken, false);
  });

  it('writes the token to localStorage only when the user opts in', async () => {
    const { controller, state, local } = await startedSetup({ token: '' });

    await controller.saveSettings({ settings: createDefaultSettings(), token: 'ghp_new', remember: true });

    assert.equal(local.getItem(TOKEN_KEY), 'ghp_new');
    assert.equal(state.get().rememberToken, true);
  });

  it('stays on Settings when saved without a token', async () => {
    const { controller, state, github } = await startedSetup({ token: '' });

    await controller.saveSettings({ settings: createDefaultSettings(), token: '', remember: false });

    assert.equal(state.get().view, 'settings');
    assert.equal(state.get().hasToken, false);
    assert.equal(github.calls.length, 0);
  });

  it('does not carry pending edits into a different branch', async () => {
    const { controller, state, github } = await startedSetup();
    controller.stageChanges([{ fileKey: 'usa:qa', key: 'greeting', value: 'kept' }]);
    github.baseBranch = 'release';

    await controller.saveSettings({
      settings: { ...createDefaultSettings(), branch: 'release' },
      token: 'ghp_token',
      remember: false,
    });

    assert.equal(state.get().pending.length, 0);
  });
});

describe('AppController.testConnection', () => {
  it('reports each check, and warns when the token can read but not write', async () => {
    const { controller, github } = setup();
    github.canPush = false;

    const checks = await controller.testConnection({ settings: createDefaultSettings(), token: 'ghp_token' });

    assert.deepEqual(checks.map((check) => [check.label, check.ok]), [
      ['Repository is reachable', true],
      ['Token can write', false],
      ['Branch "develop" exists', true],
      ['String files are readable', true],
    ]);
  });

  it('stops at the first failing check and explains it', async () => {
    const { controller, github } = setup();
    github.failOn('GET', new GitHubError({ kind: 'not-found', status: 404, message: 'Not found.' }));

    const checks = await controller.testConnection({ settings: createDefaultSettings(), token: 'ghp_token' });

    assert.deepEqual(checks, [{ label: 'Repository is reachable', ok: false, detail: 'Not found.' }]);
  });

  it('refuses to probe with invalid settings', async () => {
    const { controller, github } = setup();

    const checks = await controller.testConnection({
      settings: { ...createDefaultSettings(), repository: '???' },
      token: 'ghp_token',
    });

    assert.equal(checks[0].ok, false);
    assert.equal(github.calls.length, 0);
  });
});

describe('AppController.createPullRequest', () => {
  const request = (overrides = {}) => ({
    title: 'Add string',
    body: 'Body',
    branch: 'config-manager/add',
    commitMessage: 'Add string',
    draft: true,
    onProgress: () => {},
    ...overrides,
  });

  it('opens the pull request and clears the changes it submitted', async () => {
    const { controller, github, state } = await startedSetup();
    controller.stageChanges([{ fileKey: 'nation:qa', key: 'only_in_usa_and_mexico', value: 'x-nation' }]);

    const result = await controller.createPullRequest(request());

    assert.equal(result.url, 'https://github.com/org/repo/pull/42');
    assert.equal(state.get().pending.length, 0);
    assert.match([...github.blobs.values()][0], /"only_in_usa_and_mexico": "x-nation"\n}\n$/);
  });

  it('keeps the pending changes when the pull request could not be created', async () => {
    const { controller, github, state } = await startedSetup();
    controller.stageChanges([{ fileKey: 'nation:qa', key: 'only_in_usa_and_mexico', value: 'x-nation' }]);
    github.refs.add('refs/heads/config-manager/add');

    await assert.rejects(() => controller.createPullRequest(request()), /already exists/);

    assert.equal(state.get().pending.length, 1);
  });

  it('keeps a pending change for a file that could not be loaded, since it was never submitted', async () => {
    const files = repositoryFiles();
    delete files[pathOf('nation:qa')];
    const { controller, state } = await startedSetup({ files });
    controller.stageChanges([
      { fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' },
      { fileKey: 'nation:qa', key: 'greeting', value: 'Howdy' },
    ]);

    await controller.createPullRequest(request());

    assert.deepEqual(state.get().pending, [{ fileKey: 'nation:qa', key: 'greeting', value: 'Howdy' }]);
  });

  it('refuses to edit a file whose formatting it would change, and says which one', async () => {
    const files = repositoryFiles();
    files[pathOf('usa:qa')] = serialize({ greeting: 'hi-usa' }, '    ');
    const { controller, state } = await startedSetup({ files });
    controller.stageChanges([{ fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' }]);

    assert.deepEqual(controller.unsafeTargetFiles(), [pathOf('usa:qa')]);
    await assert.rejects(() => controller.createPullRequest(request()), /formatted differently/);
    assert.equal(state.get().pending.length, 1);
  });

  it('reports no unsafe files when every target is in the expected format', async () => {
    const { controller } = await startedSetup();
    controller.stageChanges([{ fileKey: 'usa:qa', key: 'greeting', value: 'Howdy' }]);

    assert.deepEqual(controller.unsafeTargetFiles(), []);
  });
});

describe('AppController preferences', () => {
  it('remembers the environment and hidden issue types across visits', async () => {
    const { controller, create, state } = await startedSetup();

    controller.setEnvironment('prod');
    controller.toggleIssueType('untranslated');
    await create().start();

    assert.equal(state.get().preferences.environment, 'prod');
    assert.deepEqual(state.get().preferences.hiddenIssueTypes, ['untranslated']);
  });

  it('shows a hidden issue type again when toggled twice', async () => {
    const { controller, state } = await startedSetup();

    controller.toggleIssueType('untranslated');
    controller.toggleIssueType('untranslated');

    assert.deepEqual(state.get().preferences.hiddenIssueTypes, []);
  });

  it('returns to the first page when a filter changes', async () => {
    const { controller, state } = await startedSetup();
    controller.setPage(4);

    controller.setSearch('greeting');

    assert.equal(state.get().page, 1);
  });
});
