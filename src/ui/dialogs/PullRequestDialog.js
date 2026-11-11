import { getApp, getEnvironment } from '../../app/AppRegistry.js';
import { SEVERITY } from '../../analysis/IssueTypes.js';
import { effectiveChanges, groupByFile, summarizeChanges } from '../../changes/ChangeSet.js';
import { PUBLISH_STEPS } from '../../github/PullRequestPublisher.js';
import { normalizeJiraKey } from '../../pullrequest/PullRequestDraft.js';
import { isValidBranchName } from '../../settings/settingsValidation.js';
import { badge } from '../badges.js';
import { ModalDialog } from '../Dialog.js';
import { h, replaceChildren } from '../dom.js';
import { checkbox, createField, textInput, toggle } from '../formFields.js';
import { icon } from '../icons.js';
import { renderKey, renderValue } from '../valueRenderer.js';

const MAX_LISTED_PROBLEMS = 5;
const STEP_ICONS = Object.freeze({ pending: 'circle', running: 'refresh', done: 'circle-check', failed: 'circle-alert' });
const STEP_TEXT = { pending: 'Waiting', running: 'In progress', done: 'Done', failed: 'Failed' };

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const externalLink = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text, icon('external-link', { size: 12, className: 'link-icon' }));
const branchUrl = (repository, branch) =>
  `https://github.com/${repository}/tree/${String(branch).split('/').map(encodeURIComponent).join('/')}`;

function renderReview(groups) {
  return h('details', { class: 'review' },
    h('summary', null, icon('chevron-right', { size: 14, className: 'review__chevron' }), `Review changes (${plural(groups.reduce((total, group) => total + group.changes.length, 0), 'string')} in ${plural(groups.length, 'file')})`),
    groups.map((group) =>
      h('section', { class: 'review__file' },
        h('h4', { class: 'review__title' },
          `${getApp(group.appId).label} `,
          badge(getEnvironment(group.envId).shortLabel, getEnvironment(group.envId).isProduction ? 'production' : 'info'),
          h('code', { class: 'review__path' }, group.path),
        ),
        h('table', { class: 'review__table' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Key'), h('th', { scope: 'col' }, 'Before'), h('th', { scope: 'col' }, 'After'))),
          h('tbody', null, group.changes.map((change) =>
            h('tr', null,
              h('th', { scope: 'row' }, renderKey(change.key)),
              h('td', null, change.before === null ? h('em', null, 'new') : renderValue(change.before)),
              h('td', null, renderValue(change.after)),
            ),
          )),
        ),
      ),
    ),
  );
}

/** Problems already detected on exactly the strings being submitted, so they are seen before review. */
function renderConsistency(state) {
  const changed = new Set(effectiveChanges(state.resolved).map((change) => `${change.envId}|${change.appId}|${change.key}`));
  const related = state.issues.filter((issue) => changed.has(`${issue.envId}|${issue.appId}|${issue.key}`));
  const errors = related.filter((issue) => issue.severity === SEVERITY.ERROR);
  const warnings = related.filter((issue) => issue.severity === SEVERITY.WARNING);
  const problems = [...errors, ...warnings];
  if (problems.length === 0) {
    return h('div', { class: 'notice notice--success' },
      icon('circle-check', { size: 18, className: 'notice__icon' }),
      h('p', null, 'No consistency problems found on the strings you changed.'),
    );
  }
  const listed = problems.slice(0, MAX_LISTED_PROBLEMS);
  return h('div', { class: `notice notice--${errors.length > 0 ? 'error' : 'warning'}` },
    icon('triangle-alert', { size: 18, className: 'notice__icon' }),
    h('div', { class: 'notice__body' },
      h('strong', null, `${plural(errors.length, 'error')} and ${plural(warnings.length, 'warning')} on the strings you changed`),
      ' (also listed in the description):',
      h('ul', null, listed.map((issue) =>
        h('li', null, `${getApp(issue.appId).shortLabel} ${getEnvironment(issue.envId).shortLabel}: `, renderKey(issue.key), ` \u2014 ${issue.message}`),
      )),
      problems.length > listed.length ? h('p', null, `\u2026and ${problems.length - listed.length} more.`) : null,
    ),
  );
}

function stepList(statuses) {
  return h('ol', { class: 'steps' }, PUBLISH_STEPS.map((step) => {
    const status = statuses.get(step.id) ?? 'pending';
    return h('li', { class: `step step--${status}` },
      h('span', { class: 'step__marker', 'aria-hidden': 'true' }, icon(STEP_ICONS[status], { size: 18 })),
      h('span', null, step.label, h('span', { class: 'visually-hidden' }, ` \u2014 ${STEP_TEXT[status]}`)),
    );
  }));
}

/** Review, edit and submit the pending changes as a pull request. */
export function openPullRequestDialog({ state, controller, toaster }) {
  const summary = summarizeChanges(state.resolved);
  const groups = groupByFile(state.resolved);
  const repository = state.settings.repository;
  const touched = { title: false, branch: false, body: false };
  let draft = controller.draftPullRequest('');
  let jiraKey = '';
  let jiraInvalid = false;
  const statuses = new Map();

  const dialog = new ModalDialog({
    title: 'Generate Pull Request',
    subtitle: `Opens a new branch and pull request against ${state.settings.branch}. A human review is still required.`,
    iconName: 'git-pull-request',
    size: 'xlarge',
  });

  const jira = createField({
    label: 'Jira ticket (optional)',
    hint: 'Prefixes the title and branch name and links the ticket in the description.',
    input: textInput({ placeholder: 'DTCAND-1234', onInput: onJiraInput }),
  });
  const title = createField({
    label: 'Title',
    input: textInput({ value: draft.title, monospace: false, onInput: () => { touched.title = true; validate(); } }),
  });
  const branch = createField({
    label: 'Branch',
    hint: `A new branch created from ${state.settings.branch}.`,
    input: textInput({ value: draft.branch, onInput: () => { touched.branch = true; validate(); } }),
  });
  const body = createField({
    label: 'Description (Markdown)',
    input: h('textarea', {
      class: 'input input--mono',
      rows: 14,
      value: draft.body,
      onInput: () => { touched.body = true; },
    }),
  });
  const asDraft = toggle({
    label: 'Open as draft',
    hint: 'Recommended. Mark it ready for review once you have checked the diff.',
    checked: true,
  });
  const productionConfirm = summary.touchesProduction
    ? checkbox({
      label: 'I understand merging this pull request deploys the changes to production.',
      checked: false,
      onChange: () => validate(),
    })
    : null;

  const regenerateButton = h('button', { type: 'button', class: 'btn btn--ghost btn--small', onClick: regenerate }, icon('refresh', { size: 14 }), 'Regenerate from changes');
  const createButton = h('button', { type: 'button', class: 'btn btn--primary', onClick: submit }, 'Create pull request');
  const cancelButton = h('button', { type: 'button', class: 'btn btn--ghost', onClick: () => dialog.close() }, 'Cancel');

  const formView = h('div', { class: 'pr-form' },
    summary.touchesProduction
      ? h('div', { class: 'notice notice--warning' },
        icon('shield-alert', { size: 18, className: 'notice__icon' }),
        h('p', null, h('strong', null, 'This includes production files.'), ' Review the changes carefully.'),
      )
      : null,
    renderConsistency(state),
    jira.element,
    title.element,
    branch.element,
    h('div', { class: 'field-inline' }, regenerateButton),
    body.element,
    renderReview(groups),
    asDraft.element,
    productionConfirm ? h('div', { class: 'confirm-box' }, productionConfirm.element) : null,
  );
  const progressView = h('div', { class: 'pr-progress', hidden: true, 'aria-live': 'polite' });
  replaceChildren(dialog.body, formView, progressView);

  function commitMessage() {
    const newline = draft.commitMessage.indexOf('\n');
    return `${title.input.value.trim()}${newline === -1 ? '' : draft.commitMessage.slice(newline)}`;
  }

  function applyDraft({ onlyUntouched }) {
    if (!onlyUntouched || !touched.title) title.input.value = draft.title;
    if (!onlyUntouched || !touched.branch) branch.input.value = draft.branch;
    if (!onlyUntouched || !touched.body) body.input.value = draft.body;
  }

  function onJiraInput(event) {
    const raw = event.target.value.trim();
    jiraKey = normalizeJiraKey(raw);
    jiraInvalid = raw !== '' && jiraKey === '';
    jira.setError(jiraInvalid ? 'Use a ticket key like DTCAND-1234.' : null);
    draft = controller.draftPullRequest(jiraKey);
    applyDraft({ onlyUntouched: true });
    validate();
  }

  function regenerate() {
    draft = controller.draftPullRequest(jiraKey);
    touched.title = false;
    touched.branch = false;
    touched.body = false;
    applyDraft({ onlyUntouched: false });
    validate();
  }

  function validate() {
    const titleText = title.input.value.trim();
    const branchText = branch.input.value.trim();
    title.setError(titleText === '' ? 'Enter a title.' : null);
    branch.setError(isValidBranchName(branchText) ? null : 'Enter a valid branch name, without spaces.');
    const ready = titleText !== ''
      && isValidBranchName(branchText)
      && !jiraInvalid
      && (productionConfirm === null || productionConfirm.input.checked);
    createButton.disabled = !ready;
    return ready;
  }

  function renderProgress() {
    replaceChildren(progressView, h('p', { class: 'pr-progress__lead' }, 'Creating the pull request\u2026'), stepList(statuses));
  }

  function showFormFooter() {
    replaceChildren(dialog.footer, cancelButton, createButton);
    formView.hidden = false;
    progressView.hidden = true;
  }

  function renderSuccess(result) {
    replaceChildren(
      progressView,
      h('div', { class: 'notice notice--success notice--large' },
        icon('circle-check', { size: 22, className: 'notice__icon' }),
        h('div', { class: 'notice__body' },
          h('h3', { class: 'pr-result__title' }, 'Pull request created'),
          h('p', null, externalLink(result.url, `Open pull request #${result.number}`)),
          h('p', null, result.draft
            ? 'It was opened as a draft. Review the diff on GitHub, then mark it ready for review.'
            : 'It is ready for review. A human review is still required before merging.'),
          h('p', null, 'Branch ', externalLink(branchUrl(repository, result.branch), result.branch), ` \u00B7 ${plural(result.files.length, 'file')} changed`),
        ),
      ),
      stepList(statuses),
    );
    replaceChildren(dialog.footer, h('button', { type: 'button', class: 'btn btn--primary', onClick: () => dialog.close() }, 'Close'));
    toaster.show(`Pull request #${result.number} created.`, { kind: 'success' });
  }

  function renderFailure(error) {
    const failedStep = PUBLISH_STEPS.find((step) => step.id === error.step);
    replaceChildren(
      progressView,
      h('div', { class: 'notice notice--error notice--large', role: 'alert' },
        icon('circle-alert', { size: 22, className: 'notice__icon' }),
        h('div', { class: 'notice__body' },
          h('h3', { class: 'pr-result__title' }, 'The pull request was not created'),
          h('p', null, error.message),
          failedStep ? h('p', null, `Failed at: ${failedStep.label}.`) : null,
          error.branchCreated
            ? h('p', null,
              'The branch ',
              externalLink(branchUrl(repository, error.branch), error.branch),
              ' was already created. You can open the pull request from it on GitHub, or change the branch name and try again.',
            )
            : h('p', null, 'Nothing was written to the repository.'),
        ),
      ),
      stepList(statuses),
    );
    replaceChildren(
      dialog.footer,
      h('button', { type: 'button', class: 'btn btn--ghost', onClick: () => dialog.close() }, 'Close'),
      h('button', { type: 'button', class: 'btn btn--primary', onClick: showFormFooter }, 'Back to edit'),
    );
  }

  async function submit() {
    if (!validate()) return;
    dialog.setBusy(true);
    statuses.clear();
    formView.hidden = true;
    progressView.hidden = false;
    renderProgress();
    replaceChildren(dialog.footer, h('button', { type: 'button', class: 'btn btn--primary', disabled: true }, 'Working\u2026'));
    try {
      const result = await controller.createPullRequest({
        title: title.input.value.trim(),
        body: body.input.value,
        branch: branch.input.value.trim(),
        commitMessage: commitMessage(),
        draft: asDraft.input.checked,
        onProgress: ({ step, status }) => {
          statuses.set(step, status);
          renderProgress();
        },
      });
      dialog.setBusy(false);
      renderSuccess(result);
    } catch (error) {
      dialog.setBusy(false);
      renderFailure(error);
    }
  }

  showFormFooter();
  validate();
  dialog.open();
  title.input.focus();
}
