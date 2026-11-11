import { analyzeCatalogs } from '../analysis/analyzeCatalogs.js';
import { IssueIndex } from '../analysis/IssueIndex.js';
import { applyChanges, groupByFile, resolveChanges } from '../changes/ChangeSet.js';
import { PublishError } from '../github/PullRequestPublisher.js';
import { buildPullRequestDraft } from '../pullrequest/PullRequestDraft.js';
import { loadCatalogs } from '../strings/CatalogLoader.js';
import { listFileTargets } from './filePaths.js';
import {
  normalizeSettings,
  splitRepository,
  validateSettings,
} from '../settings/settingsValidation.js';

const scopeOf = (settings) => `${settings.repository}@${settings.branch}`;

function describeError(error) {
  return {
    message: error?.message ?? String(error),
    kind: error?.kind ?? 'unknown',
    ssoUrl: error?.ssoUrl ?? null,
  };
}

/**
 * Everything the UI can ask the app to do, with no DOM in sight.
 *
 * It owns the loaded catalogues and the pending changes, re-derives the effective catalogues
 * and issues after every change, and publishes the state for views to render.
 */
export class AppController {
  #state;
  #settingsStore;
  #tokenStore;
  #preferencesStore;
  #pendingStorage;
  #createGitHub;
  #now;
  #pending;

  constructor({ state, settingsStore, tokenStore, preferencesStore, pendingStorage, createGitHub, now = () => new Date() }) {
    this.#state = state;
    this.#settingsStore = settingsStore;
    this.#tokenStore = tokenStore;
    this.#preferencesStore = preferencesStore;
    this.#pendingStorage = pendingStorage;
    this.#createGitHub = createGitHub;
    this.#now = now;
  }

  async start() {
    const settings = this.#settingsStore.load();
    const token = this.#tokenStore.get();
    this.#pending = this.#pendingStorage.load(scopeOf(settings));
    this.#state.set({
      settings,
      preferences: this.#preferencesStore.load(),
      hasToken: token !== '',
      rememberToken: this.#tokenStore.isRemembered(),
      view: token === '' ? 'settings' : 'dashboard',
    });
    this.#recompute();
    if (token !== '' && validateSettings(settings).valid) await this.loadData();
  }

  // --- navigation and preferences -------------------------------------------------------------

  setView(view) {
    this.#state.set({ view });
  }

  setEnvironment(environment) {
    this.#updatePreferences({ environment });
    this.#state.set({ page: 1 });
  }

  setDashboardTab(dashboardTab) {
    this.#updatePreferences({ dashboardTab });
  }

  setStatusFilter(statusFilter) {
    this.#updatePreferences({ statusFilter });
    this.#state.set({ page: 1 });
  }

  setPageSize(pageSize) {
    this.#updatePreferences({ pageSize });
    this.#state.set({ page: 1 });
  }

  toggleIssueType(type) {
    const hidden = new Set(this.#state.get().preferences.hiddenIssueTypes);
    if (hidden.has(type)) hidden.delete(type);
    else hidden.add(type);
    this.#updatePreferences({ hiddenIssueTypes: [...hidden] });
    this.#state.set({ page: 1 });
  }

  setSearch(search) {
    this.#state.set({ search, page: 1 });
  }

  setPage(page) {
    this.#state.set({ page });
  }

  #updatePreferences(patch) {
    const preferences = { ...this.#state.get().preferences, ...patch };
    this.#preferencesStore.save(preferences);
    this.#state.set({ preferences });
  }

  // --- loading --------------------------------------------------------------------------------

  async loadData() {
    const { settings } = this.#state.get();
    const token = this.#tokenStore.get();
    this.#state.set({ load: { status: 'loading', error: null, loadedAt: null, commitSha: '' } });
    try {
      const { reader } = this.#createGitHub(token, splitRepository(settings.repository));
      const { commitSha } = await reader.getBranchHead(settings.branch);
      const { catalogs, failures } = await loadCatalogs({
        reader,
        targets: listFileTargets(settings),
        ref: commitSha,
      });

      if (catalogs.size === 0) {
        const detail = failures[0]?.message ?? 'No files were returned.';
        this.#state.set({
          baseCatalogs: new Map(),
          failures,
          load: {
            status: 'error',
            error: { message: `None of the string files could be loaded. ${detail}`, kind: 'not-found', ssoUrl: null },
            loadedAt: null,
            commitSha,
          },
        });
        this.#recompute();
        return;
      }

      this.#state.set({
        baseCatalogs: catalogs,
        failures,
        load: { status: 'ready', error: null, loadedAt: this.#now(), commitSha },
      });
      this.#recompute();
    } catch (error) {
      this.#state.set({
        load: { status: 'error', error: describeError(error), loadedAt: null, commitSha: '' },
      });
    }
  }

  // --- settings -------------------------------------------------------------------------------

  /** Validates and saves; returns `{ ok: false, errors }` without side effects when invalid. */
  async saveSettings({ settings, token, remember }) {
    const { valid, errors } = validateSettings(settings);
    if (!valid) return { ok: false, errors };

    const normalized = this.#settingsStore.save(settings);
    this.#tokenStore.set(token, { remember });
    const hasToken = this.#tokenStore.get() !== '';
    this.#pending = this.#pendingStorage.load(scopeOf(normalized));
    this.#state.set({
      settings: normalized,
      hasToken,
      rememberToken: this.#tokenStore.isRemembered(),
      baseCatalogs: new Map(),
      failures: [],
      view: hasToken ? 'dashboard' : 'settings',
    });
    this.#recompute();
    if (hasToken) await this.loadData();
    return { ok: true, errors: {} };
  }

  clearToken() {
    this.#tokenStore.clear();
    this.#state.set({ hasToken: false, rememberToken: false });
  }

  currentToken() {
    return this.#tokenStore.get();
  }

  /** Probes the repository, the branch and one file, and reports each check separately. */
  async testConnection({ settings, token }) {
    const checks = [];
    const check = async (label, run) => {
      try {
        const detail = await run();
        checks.push({ label, ok: true, detail: detail ?? '' });
        return true;
      } catch (error) {
        checks.push({ label, ok: false, detail: describeError(error).message });
        return false;
      }
    };

    const normalized = normalizeSettings(settings);
    const { valid } = validateSettings(normalized);
    if (!valid) return [{ label: 'Settings', ok: false, detail: 'Fix the highlighted fields first.' }];

    const { reader } = this.#createGitHub(token, splitRepository(normalized.repository));
    let writable = true;
    const repositoryOk = await check('Repository is reachable', async () => {
      const repository = await reader.getRepository();
      writable = repository.permissions?.push !== false;
      return repository.full_name;
    });
    if (!repositoryOk) return checks;

    if (!writable) {
      checks.push({
        label: 'Token can write',
        ok: false,
        detail: 'The token can read this repository but not push. You can browse, but not create pull requests.',
      });
    }

    let commitSha = '';
    const branchOk = await check(`Branch "${normalized.branch}" exists`, async () => {
      ({ commitSha } = await reader.getBranchHead(normalized.branch));
      return commitSha.slice(0, 7);
    });
    if (!branchOk) return checks;

    const [first] = listFileTargets(normalized);
    await check('String files are readable', async () => {
      await reader.readTextFile(first.path, commitSha);
      return first.path;
    });
    return checks;
  }

  // --- pending changes ------------------------------------------------------------------------

  /** Records intent for `[{ fileKey, key, value }]`; a value equal to the loaded one cancels a pending edit. */
  stageChanges(changes) {
    const { baseCatalogs } = this.#state.get();
    for (const { fileKey, key, value } of changes) {
      if (baseCatalogs.get(fileKey)?.get(key) === value) {
        this.#pending.remove(fileKey, key);
      } else {
        this.#pending.upsert({ fileKey, key, value });
      }
    }
    this.#persistAndRecompute();
  }

  removePending(fileKey, key) {
    this.#pending.remove(fileKey, key);
    this.#persistAndRecompute();
  }

  clearPending() {
    this.#pending.clear();
    this.#persistAndRecompute();
  }

  #persistAndRecompute() {
    this.#pendingStorage.save(scopeOf(this.#state.get().settings), this.#pending);
    this.#recompute();
  }

  #recompute() {
    const { baseCatalogs = new Map(), failures = [] } = this.#state.get();
    const pending = this.#pending.list();
    const resolved = resolveChanges(pending, baseCatalogs);
    const effectiveCatalogs = applyChanges(baseCatalogs, resolved);
    const issues = analyzeCatalogs({ catalogs: effectiveCatalogs, failures });
    this.#state.set({
      pending,
      resolved,
      effectiveCatalogs,
      issues,
      issueIndex: new IssueIndex(issues),
    });
  }

  // --- pull request ---------------------------------------------------------------------------

  /** Editable starting point for the PR, regenerated whenever the Jira key changes. */
  draftPullRequest(jiraKey = '') {
    const { resolved, issues, settings } = this.#state.get();
    return buildPullRequestDraft({
      resolvedChanges: resolved,
      issues,
      jiraKey,
      jiraBaseUrl: settings.jiraBaseUrl,
      now: this.#now(),
    });
  }

  /** Files the pending changes would touch that cannot be edited safely, if any. */
  unsafeTargetFiles() {
    const { resolved, baseCatalogs } = this.#state.get();
    return groupByFile(resolved)
      .filter((group) => baseCatalogs.get(group.fileKey)?.roundTripSafe === false)
      .map((group) => group.path);
  }

  async createPullRequest({ title, body, branch, commitMessage, draft, onProgress }) {
    const { resolved, settings } = this.#state.get();
    const groups = groupByFile(resolved);
    const files = groups.map((group) => ({
      path: group.path,
      changes: new Map(group.changes.map((change) => [change.key, change.after])),
    }));
    if (files.length === 0) {
      throw new PublishError({ step: 'read-files', message: 'There are no pending changes to submit.', branch });
    }

    const { publisher } = this.#createGitHub(this.#tokenStore.get(), splitRepository(settings.repository));
    const result = await publisher.publish({
      baseBranch: settings.branch,
      branch,
      title,
      body,
      commitMessage,
      draft,
      files,
      onProgress,
    });
    for (const { fileKey, changes } of groups) {
      for (const { key } of changes) this.#pending.remove(fileKey, key);
    }
    this.#persistAndRecompute();
    return result;
  }
}
