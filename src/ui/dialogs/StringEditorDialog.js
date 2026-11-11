import { APPS, ENVIRONMENTS, getApp, makeFileKey } from '../../app/AppRegistry.js';
import { validateAcrossApps, validateKey, validateValue } from '../../changes/ChangeValidator.js';
import { ModalDialog } from '../Dialog.js';
import { h, replaceChildren } from '../dom.js';
import { choice, createField, textInput, toggle } from '../formFields.js';
import { icon } from '../icons.js';
import { renderValue } from '../valueRenderer.js';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const hasLetters = (text) => /\p{L}{3,}/u.test(text);
const unique = (items) => [...new Set(items)];
const MESSAGE_ICONS = Object.freeze({ error: 'circle-alert', warning: 'triangle-alert', info: 'info' });

/**
 * Add a string (mode `add`) or change existing ones (mode `edit`) in one or more apps and
 * environments. Nothing is written anywhere: the result is staged as pending changes.
 */
export function openStringEditor({ state, controller, toaster, mode, key = '', appIds = null }) {
  const effective = state.effectiveCatalogs;
  const initialEnvId = state.preferences.environment;
  const keyLocked = key !== '';
  const currentIn = (appId, envId) => effective.get(makeFileKey(appId, envId))?.get(key);
  const isAvailable = (app) => ENVIRONMENTS.some((env) => effective.has(makeFileKey(app.id, env.id)));

  const form = {
    key,
    envIds: new Set([initialEnvId]),
    appIds: new Set((appIds ?? APPS.map((app) => app.id)).filter((id) => isAvailable(getApp(id)))),
    shared: true,
    sharedValue: '',
    values: Object.fromEntries(APPS.map((app) => [app.id, ''])),
  };
  prefill();

  /** Starts from what is there today: the shared text if the apps agree, per-app text if not. */
  function prefill() {
    if (key === '') return;
    const reference = APPS.map((app) => currentIn(app.id, initialEnvId)).find((value) => value !== undefined) ?? '';
    for (const app of APPS) form.values[app.id] = currentIn(app.id, initialEnvId) ?? reference;
    const selected = [...form.appIds].map((appId) => currentIn(appId, initialEnvId)).filter((value) => value !== undefined);
    const agree = selected.length > 0 && selected.every((value) => value === selected[0]);
    if (mode === 'edit') {
      form.shared = agree;
      form.sharedValue = agree ? selected[0] : '';
    } else {
      form.sharedValue = reference;
    }
  }

  const dialog = new ModalDialog({
    title: mode === 'edit' ? 'Edit string' : 'Add string',
    subtitle: 'Nothing is written to GitHub yet. The change is staged for review first.',
    iconName: mode === 'edit' ? 'pencil' : 'plus',
    size: 'large',
  });

  const keyField = createField({
    label: 'Key',
    hint: keyLocked ? null : 'Lowercase snake_case, e.g. subscription_offer_title.',
    input: textInput({
      value: form.key,
      placeholder: 'string_key',
      onInput: (event) => {
        form.key = event.target.value;
        interacted = true;
        renderMessages();
      },
    }),
  });
  keyField.input.readOnly = keyLocked;

  const environmentBoxes = ENVIRONMENTS.map((env) => choice({
    label: env.label,
    hint: env.isProduction ? 'Shipped builds' : 'QA and staging builds',
    checked: form.envIds.has(env.id),
    onChange: (event) => {
      if (event.target.checked) form.envIds.add(env.id);
      else form.envIds.delete(env.id);
      interacted = true;
      renderValues();
      renderMessages();
    },
  }));

  const appBoxes = APPS.map((app) => choice({
    appId: app.id,
    label: app.label,
    hint: isAvailable(app) ? app.locale : `${app.locale} \u00B7 file unavailable`,
    checked: form.appIds.has(app.id),
    disabled: !isAvailable(app),
    onChange: (event) => {
      if (event.target.checked) form.appIds.add(app.id);
      else form.appIds.delete(app.id);
      interacted = true;
      renderValues();
      renderMessages();
    },
  }));

  const sharedToggle = toggle({
    label: 'Use the same text for every selected app',
    hint: 'Turn this off to write different text per app, for example a Spanish translation for Mexico.',
    checked: form.shared,
    onChange: (event) => {
      const selected = APPS.filter((app) => form.appIds.has(app.id));
      if (event.target.checked) {
        form.sharedValue = selected.length > 0 ? form.values[selected[0].id] : form.sharedValue;
      } else {
        for (const app of selected) form.values[app.id] = form.sharedValue;
      }
      form.shared = event.target.checked;
      interacted = true;
      renderValues();
      renderMessages();
    },
  });

  /** Errors stay hidden on a form nobody has typed in yet; the submit button is disabled either way. */
  let interacted = false;

  const valuesContainer = h('div', { class: 'editor-values' });
  const messages = h('div', { class: 'editor-messages', 'aria-live': 'polite' });
  const submitButton = h('button', { type: 'button', class: 'btn btn--primary', onClick: submit }, 'Add to pending changes');

  function firstSelectedEnvId() {
    return ENVIRONMENTS.find((env) => form.envIds.has(env.id))?.id ?? initialEnvId;
  }

  function valueField({ label, lang, value, current, onInput }) {
    const textarea = h('textarea', {
      class: 'input input--mono',
      rows: 3,
      value,
      lang,
      spellcheck: 'true',
      onInput: (event) => {
        onInput(event.target.value);
        interacted = true;
        renderMessages();
      },
    });
    const field = createField({ label, input: textarea });
    if (current !== undefined) {
      field.element.append(h('p', { class: 'field__hint' }, 'Current: ', renderValue(current)));
    }
    return field.element;
  }

  function renderValues() {
    const selected = APPS.filter((app) => form.appIds.has(app.id));
    const envId = firstSelectedEnvId();
    if (form.shared) {
      const currents = selected.map((app) => currentIn(app.id, envId)).filter((value) => value !== undefined);
      const agreed = currents.length > 0 && currents.every((value) => value === currents[0]);
      replaceChildren(valuesContainer, valueField({
        label: 'Text',
        value: form.sharedValue,
        current: agreed ? currents[0] : undefined,
        onInput: (value) => {
          form.sharedValue = value;
        },
      }));
      return;
    }
    replaceChildren(
      valuesContainer,
      selected.length === 0 ? h('p', { class: 'field__hint' }, 'Choose at least one app.') : null,
      selected.map((app) => valueField({
        label: app.label,
        lang: app.locale,
        value: form.values[app.id],
        current: currentIn(app.id, envId),
        onInput: (value) => {
          form.values[app.id] = value;
        },
      })),
    );
  }

  function analyze() {
    const errors = [];
    const warnings = [];
    const infos = [];
    const trimmedKey = form.key.trim();
    const selectedApps = APPS.filter((app) => form.appIds.has(app.id));
    const selectedEnvs = ENVIRONMENTS.filter((env) => form.envIds.has(env.id));
    const valueOf = (app) => (form.shared ? form.sharedValue : form.values[app.id]);

    const targets = [];
    const unavailable = [];
    for (const env of selectedEnvs) {
      for (const app of selectedApps) {
        const catalog = effective.get(makeFileKey(app.id, env.id));
        if (catalog) targets.push({ app, env, fileKey: catalog.fileKey, current: catalog.get(trimmedKey), value: valueOf(app) });
        else unavailable.push(`${app.label} (${env.shortLabel})`);
      }
    }

    if (selectedApps.length === 0 || selectedEnvs.length === 0) errors.push('Choose at least one app and one environment.');
    if (unavailable.length > 0) warnings.push(`Skipped because the file could not be loaded: ${unavailable.join(', ')}.`);

    if (!keyLocked) {
      const existingKeys = [...new Set(targets.flatMap((target) => effective.get(target.fileKey).keys()))];
      const keyProblems = validateKey(trimmedKey, { existingKeys });
      errors.push(...keyProblems.errors);
      warnings.push(...keyProblems.warnings);
      const already = targets.filter((target) => target.current !== undefined);
      if (trimmedKey !== '' && already.length > 0) {
        infos.push(`\`${trimmedKey}\` already exists in ${[...new Set(already.map((target) => target.app.label))].join(', ')}; its text will be replaced.`);
      }
    }

    const perApp = new Map();
    for (const app of selectedApps) perApp.set(app, validateValue(valueOf(app)));
    const labelled = (app, text) => (form.shared ? text : `${app.shortLabel}: ${text}`);
    for (const [app, result] of perApp) {
      for (const text of result.errors) errors.push(labelled(app, text));
      for (const text of result.warnings) warnings.push(labelled(app, text));
    }
    if (!form.shared) {
      warnings.push(...validateAcrossApps(Object.fromEntries(selectedApps.map((app) => [app.label, valueOf(app)]))));
    }
    for (const app of selectedApps.filter((candidate) => candidate.translationOf)) {
      const source = getApp(app.translationOf);
      const sourceText = form.appIds.has(source.id) ? valueOf(source) : currentIn(source.id, firstSelectedEnvId());
      if (typeof sourceText === 'string' && valueOf(app).trim() === sourceText.trim() && hasLetters(valueOf(app))) {
        warnings.push(`${app.label} text is identical to ${source.label}. ${app.locale} is a translation, so this will be flagged as untranslated.`);
      }
    }
    if (selectedEnvs.some((env) => env.isProduction)) {
      warnings.push('Production is selected. Merging the pull request deploys this text to production.');
    }

    const changes = errors.length === 0
      ? targets
        .filter((target) => target.value !== target.current)
        .map((target) => ({ fileKey: target.fileKey, key: trimmedKey, value: target.value }))
      : [];
    if (errors.length === 0 && changes.length === 0) errors.push('Nothing to change: the text matches what is already there.');
    return { errors: unique(errors), warnings: unique(warnings), infos, changes };
  }

  let latest = { changes: [] };

  function renderMessages() {
    latest = analyze();
    const section = (items, kind) => items.map((text) => h('li', { class: `message message--${kind}` },
      icon(MESSAGE_ICONS[kind], { size: 16, className: 'message__icon' }),
      h('span', null, text),
    ));
    replaceChildren(
      messages,
      h('ul', { class: 'message-list' },
        section(interacted ? latest.errors : [], 'error'),
        section(latest.warnings, 'warning'),
        section(latest.infos, 'info'),
      ),
    );
    submitButton.disabled = latest.errors.length > 0 || latest.changes.length === 0;
    submitButton.textContent = latest.changes.length > 0
      ? `Add ${plural(latest.changes.length, 'change')} to pending`
      : 'Add to pending changes';
  }

  function submit() {
    renderMessages();
    if (latest.errors.length > 0 || latest.changes.length === 0) return;
    controller.stageChanges(latest.changes);
    toaster.show(`${plural(latest.changes.length, 'change')} added to pending.`, { kind: 'success' });
    dialog.close();
  }

  replaceChildren(
    dialog.body,
    keyField.element,
    h('fieldset', { class: 'fieldset' },
      h('legend', { class: 'fieldset__legend' }, 'Environments'),
      h('div', { class: 'choice-group' }, environmentBoxes.map((box) => box.element)),
    ),
    h('fieldset', { class: 'fieldset' },
      h('legend', { class: 'fieldset__legend' }, 'Apps'),
      h('div', { class: 'choice-group choice-group--three' }, appBoxes.map((box) => box.element)),
    ),
    sharedToggle.element,
    valuesContainer,
    messages,
  );
  replaceChildren(
    dialog.footer,
    h('button', { type: 'button', class: 'btn btn--ghost', onClick: () => dialog.close() }, 'Cancel'),
    submitButton,
  );

  renderValues();
  renderMessages();
  dialog.open();
  const firstTextarea = valuesContainer.querySelector('textarea');
  (keyLocked ? firstTextarea : keyField.input)?.focus();
}
