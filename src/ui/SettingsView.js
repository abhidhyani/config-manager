import { APPS, ENVIRONMENTS } from '../app/AppRegistry.js';
import { listFileTargets } from '../app/filePaths.js';
import { createDefaultSettings } from '../settings/SettingsDefaults.js';
import { normalizeSettings, parseRepositoryInput, validateSettings } from '../settings/settingsValidation.js';
import { appDot } from './appTheme.js';
import { h, replaceChildren } from './dom.js';
import { createField, textInput, toggle } from './formFields.js';
import { icon } from './icons.js';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

function tokenHelp() {
  return h('span', null,
    'Create a ',
    h('a', { href: TOKEN_URL, target: '_blank', rel: 'noopener noreferrer' }, 'fine-grained token'),
    ' for the config repository with ',
    h('strong', null, 'Contents: read and write'),
    ', ',
    h('strong', null, 'Pull requests: read and write'),
    ' and Metadata: read. A classic token needs the ',
    h('code', null, 'repo'),
    ' scope. If your organization enforces SAML SSO, authorize the token for it. ',
    'The token is sent only to api.github.com.',
  );
}

function settingsCard({ step, iconName, title, description }, ...children) {
  return h('section', { class: 'card settings-card' },
    h('header', { class: 'settings-card__header' },
      h('span', { class: 'settings-card__icon' }, icon(iconName, { size: 20 })),
      h('div', { class: 'settings-card__heading' },
        h('h3', { class: 'settings-card__title' }, h('span', { class: 'settings-card__step' }, step), title),
        h('p', { class: 'settings-card__description' }, description),
      ),
    ),
    h('div', { class: 'settings-card__body' }, children),
  );
}

/**
 * The settings form. It is rebuilt from saved settings each time the view is opened, and keeps
 * its own field state while open so typing is never interrupted by the dashboard re-rendering.
 */
export class SettingsView {
  #controller;
  #toaster;
  #fields = {};
  #previewList = h('ul', { class: 'path-list' });
  #connectionResults = h('div', { class: 'connection-results', 'aria-live': 'polite' });
  #advanced = h('details', { class: 'advanced' });
  #testButton;
  #saveButton;

  constructor({ controller, toaster }) {
    this.#controller = controller;
    this.#toaster = toaster;
    this.element = h('section', { class: 'settings', 'aria-labelledby': 'settings-title' });
  }

  show(state) {
    this.#fields = {};
    const { settings } = state;
    const tokenInput = textInput({ value: this.#controller.currentToken(), type: 'password' });
    const revealButton = h('button', {
      type: 'button',
      class: 'icon-button icon-button--subtle',
      'aria-label': 'Show token',
      onClick: () => {
        const hidden = tokenInput.type === 'password';
        tokenInput.type = hidden ? 'text' : 'password';
        revealButton.setAttribute('aria-label', hidden ? 'Hide token' : 'Show token');
        replaceChildren(revealButton, icon(hidden ? 'eye-off' : 'eye', { size: 16 }));
      },
    }, icon('eye', { size: 16 }));
    const token = this.#register('token', createField({
      label: 'GitHub personal access token',
      hint: tokenHelp(),
      input: tokenInput,
      leadingIcon: 'key',
      trailing: revealButton,
    }));
    const remember = toggle({
      label: 'Remember token on this device',
      hint: 'Stored unencrypted in this browser\u2019s localStorage. Leave off on a shared computer; otherwise it is forgotten when the tab closes.',
      checked: state.rememberToken,
    });
    this.#fields.remember = remember;

    const repository = this.#register('repository', createField({
      label: 'Repository',
      hint: 'owner/repository, or paste a GitHub URL (a /tree/branch/path link also fills in the branch and base path).',
      input: textInput({ value: settings.repository, placeholder: 'foxcorp-product/product-client-config' }),
      leadingIcon: 'git-branch',
    }));
    repository.input.addEventListener('change', () => this.#applyPastedRepository());
    const branch = this.#register('branch', createField({
      label: 'Branch to read from and open pull requests against',
      input: textInput({ value: settings.branch, placeholder: 'develop', onInput: () => this.#updatePreview() }),
    }));
    const basePath = this.#register('basePath', createField({
      label: 'Base path',
      hint: 'Folder in the repository that holds the Android configuration.',
      input: textInput({ value: settings.basePath, placeholder: 'foxplus/android', onInput: () => this.#updatePreview() }),
    }));

    this.#buildAdvanced(settings);
    this.#testButton = h('button', { type: 'button', class: 'btn', onClick: () => this.#testConnection() }, 'Test connection');
    this.#saveButton = h('button', { type: 'button', class: 'btn btn--primary', onClick: () => this.#save() }, 'Save and load strings');

    replaceChildren(
      this.element,
      h('header', { class: 'view-header' },
        h('h2', { id: 'settings-title', class: 'view-title' }, 'Settings'),
        h('p', { class: 'view-lead' }, 'Everything is stored in this browser. Nothing is sent anywhere except GitHub.'),
      ),
      settingsCard(
        { step: 1, iconName: 'key', title: 'GitHub access', description: 'A personal access token lets this page read the files and open pull requests as you.' },
        token.element,
        remember.element,
        h('div', { class: 'settings-card__actions' },
          h('button', { type: 'button', class: 'btn btn--ghost btn--small', onClick: () => this.#clearToken() }, icon('trash', { size: 14 }), 'Clear saved token'),
        ),
      ),
      settingsCard(
        { step: 2, iconName: 'git-branch', title: 'Repository', description: 'Where the string files live and which branch pull requests target.' },
        repository.element,
        h('div', { class: 'field-grid' }, branch.element, basePath.element),
        this.#advanced,
      ),
      settingsCard(
        { step: 3, iconName: 'file-text', title: 'Files that will be read', description: 'Calculated from the values above, so you can check them before loading.' },
        this.#previewList,
      ),
      this.#connectionResults,
      h('div', { class: 'form-actions' },
        h('button', { type: 'button', class: 'btn btn--ghost', onClick: () => this.#resetToDefaults() }, 'Restore defaults'),
        h('div', { class: 'form-actions__main' }, this.#testButton, this.#saveButton),
      ),
    );
    this.#updatePreview();
  }

  #register(name, field) {
    this.#fields[name] = field;
    return field;
  }

  #buildAdvanced(settings) {
    const directories = APPS.map((app) => this.#register(`directories.${app.id}`, createField({
      label: `${app.label} folder`,
      input: textInput({ value: settings.directories[app.id], onInput: () => this.#updatePreview() }),
    })));
    const fileNames = ENVIRONMENTS.map((env) => this.#register(`fileNames.${env.id}`, createField({
      label: `${env.label} file name`,
      input: textInput({ value: settings.fileNames[env.id], onInput: () => this.#updatePreview() }),
    })));
    const jira = this.#register('jiraBaseUrl', createField({
      label: 'Jira base URL',
      hint: 'Used to link the Jira ticket in pull request descriptions. Leave empty to omit links.',
      input: textInput({ value: settings.jiraBaseUrl, placeholder: 'https://example.atlassian.net/browse/' }),
    }));
    replaceChildren(
      this.#advanced,
      h('summary', null, icon('chevron-right', { size: 14, className: 'advanced__chevron' }), 'Advanced: folders, file names and Jira'),
      h('div', { class: 'advanced__body' },
        h('div', { class: 'field-grid' }, directories.map((field) => field.element)),
        h('div', { class: 'field-grid' }, fileNames.map((field) => field.element)),
        jira.element,
      ),
    );
  }

  #readSettings() {
    const value = (name) => this.#fields[name].input.value;
    return {
      repository: value('repository'),
      branch: value('branch'),
      basePath: value('basePath'),
      directories: Object.fromEntries(APPS.map((app) => [app.id, value(`directories.${app.id}`)])),
      fileNames: Object.fromEntries(ENVIRONMENTS.map((env) => [env.id, value(`fileNames.${env.id}`)])),
      jiraBaseUrl: value('jiraBaseUrl'),
    };
  }

  #writeSettings(settings) {
    const set = (name, value) => {
      this.#fields[name].input.value = value;
    };
    set('repository', settings.repository);
    set('branch', settings.branch);
    set('basePath', settings.basePath);
    for (const app of APPS) set(`directories.${app.id}`, settings.directories[app.id]);
    for (const env of ENVIRONMENTS) set(`fileNames.${env.id}`, settings.fileNames[env.id]);
    set('jiraBaseUrl', settings.jiraBaseUrl);
    this.#updatePreview();
  }

  #applyPastedRepository() {
    const input = this.#fields.repository.input;
    const parsed = parseRepositoryInput(input.value);
    if (!parsed) return;
    input.value = `${parsed.owner}/${parsed.repo}`;
    if (parsed.branch) this.#fields.branch.input.value = parsed.branch;
    if (parsed.path) this.#fields.basePath.input.value = parsed.path;
    this.#updatePreview();
  }

  #updatePreview() {
    const normalized = normalizeSettings(this.#readSettings());
    const labelOf = (target) => `${APPS.find((app) => app.id === target.appId).label} \u00B7 ${ENVIRONMENTS.find((env) => env.id === target.envId).shortLabel}`;
    replaceChildren(
      this.#previewList,
      h('li', { class: 'path-list__ref' },
        icon('git-branch', { size: 14 }),
        `${normalized.repository || '(repository)'} @ ${normalized.branch || '(branch)'}`),
      listFileTargets(normalized).map((target) =>
        h('li', { class: 'path-list__item' },
          h('span', { class: 'path-list__label' }, appDot(APPS.find((app) => app.id === target.appId)), labelOf(target)),
          h('code', null, target.path),
        ),
      ),
    );
  }

  #showErrors(errors) {
    for (const [name, field] of Object.entries(this.#fields)) field.setError?.(errors[name]);
    const firstName = Object.keys(errors)[0];
    if (!firstName) return;
    if (/^(directories|fileNames|jiraBaseUrl)/.test(firstName)) this.#advanced.open = true;
    this.#fields[firstName]?.input.focus();
  }

  #collect() {
    const settings = this.#readSettings();
    const { valid, errors } = validateSettings(settings);
    this.#showErrors(errors);
    return { valid, settings, token: this.#fields.token.input.value, remember: this.#fields.remember.input.checked };
  }

  async #save() {
    const { valid, settings, token, remember } = this.#collect();
    if (!valid) return;
    await this.#run(this.#saveButton, 'Saving\u2026', async () => {
      const result = await this.#controller.saveSettings({ settings, token, remember });
      if (result.ok) {
        this.#toaster.show(token.trim() === '' ? 'Settings saved. Add a token to load strings.' : 'Settings saved.', { kind: 'success' });
      }
    });
  }

  async #testConnection() {
    const { valid, settings, token } = this.#collect();
    if (!valid) return;
    if (token.trim() === '') {
      this.#renderConnectionResults([{ label: 'Token', ok: false, detail: 'Enter a token first.' }]);
      return;
    }
    await this.#run(this.#testButton, 'Testing\u2026', async () => {
      this.#renderConnectionResults(await this.#controller.testConnection({ settings, token: token.trim() }));
    });
  }

  /** Disables both action buttons and relabels the one in use until `task` settles. */
  async #run(button, busyLabel, task) {
    const idleLabel = button.textContent;
    this.#testButton.disabled = true;
    this.#saveButton.disabled = true;
    button.textContent = busyLabel;
    this.#connectionResults.setAttribute('aria-busy', 'true');
    try {
      await task();
    } finally {
      button.textContent = idleLabel;
      this.#testButton.disabled = false;
      this.#saveButton.disabled = false;
      this.#connectionResults.removeAttribute('aria-busy');
    }
  }

  #renderConnectionResults(checks) {
    replaceChildren(
      this.#connectionResults,
      h('ul', { class: 'check-list' },
        checks.map((check) =>
          h('li', { class: `check-list__item ${check.ok ? 'is-ok' : 'is-failed'}` },
            h('span', { class: 'check-list__status' }, icon(check.ok ? 'circle-check' : 'circle-alert', { size: 14 }), check.ok ? 'OK' : 'Failed'),
            h('span', null, check.label, check.detail ? h('span', { class: 'check-list__detail' }, ` \u2014 ${check.detail}`) : null),
          ),
        ),
      ),
    );
  }

  #clearToken() {
    this.#controller.clearToken();
    this.#fields.token.input.value = '';
    this.#fields.remember.input.checked = false;
    this.#toaster.show('Token removed from this browser.');
  }

  #resetToDefaults() {
    this.#writeSettings(createDefaultSettings());
    this.#showErrors({});
    this.#toaster.show('Defaults restored. Save to apply them.');
  }
}
