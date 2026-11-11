import { getApp, getEnvironment } from '../app/AppRegistry.js';
import { CHANGE_KIND, effectiveChanges, summarizeChanges } from '../changes/ChangeSet.js';
import { appAvatar } from './appTheme.js';
import { badge } from './badges.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { renderKey, renderValue } from './valueRenderer.js';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function groupByFileKey(resolved) {
  const groups = new Map();
  for (const change of resolved) groups.set(change.fileKey, [...(groups.get(change.fileKey) ?? []), change]);
  return [...groups.values()].sort((a, b) => a[0].appId.localeCompare(b[0].appId) || a[0].envId.localeCompare(b[0].envId));
}

function describeChange(change) {
  switch (change.kind) {
    case CHANGE_KIND.ADD:
      return h('div', { class: 'change__values' }, badge('New', 'pending', null, 'plus'), renderValue(change.after));
    case CHANGE_KIND.UPDATE:
      return h('div', { class: 'change__values' },
        h('span', { class: 'change__before' }, renderValue(change.before)),
        h('span', { class: 'change__arrow', 'aria-label': 'changes to' }, icon('chevron-down', { size: 14 })),
        renderValue(change.after),
      );
    case CHANGE_KIND.UNCHANGED:
      return h('p', { class: 'change__note' }, 'Now matches the loaded value, so nothing will be written.');
    default:
      return h('p', { class: 'change__note change__note--error' }, 'This file could not be loaded, so the change cannot be submitted.');
  }
}

function renderChange(change, controller) {
  return h('li', { class: `change change--${change.kind}` },
    h('div', { class: 'change__main' },
      h('div', { class: 'change__key' }, renderKey(change.key)),
      describeChange(change),
    ),
    h('button', {
      type: 'button',
      class: 'icon-button icon-button--subtle',
      'aria-label': `Remove pending change to ${change.key} in ${getApp(change.appId).label} ${getEnvironment(change.envId).shortLabel}`,
      onClick: () => controller.removePending(change.fileKey, change.key),
    }, icon('x', { size: 16 })),
  );
}

function renderGroup(changes, controller) {
  const [{ appId, envId }] = changes;
  const app = getApp(appId);
  const environment = getEnvironment(envId);
  return h('section', { class: `change-group app--${appId}` },
    h('h3', { class: 'change-group__title' },
      appAvatar(app),
      h('span', { class: 'change-group__name' }, app.label),
      badge(environment.shortLabel, environment.isProduction ? 'production' : 'info'),
    ),
    h('ul', { class: 'change-list' }, changes.map((change) => renderChange(change, controller))),
  );
}

function renderEmpty() {
  return h('div', { class: 'pending-panel__empty' },
    h('span', { class: 'pending-panel__empty-icon' }, icon('inbox', { size: 26 })),
    h('p', { class: 'pending-panel__empty-title' }, 'Nothing staged yet'),
    h('p', null, 'Edits you make appear here for review. Nothing is written to GitHub until you generate a pull request.'),
  );
}

function renderFooter(state, { controller, dialogs }) {
  const effective = effectiveChanges(state.resolved);
  const unsafeFiles = controller.unsafeTargetFiles();
  const summary = summarizeChanges(state.resolved);
  const canSubmit = effective.length > 0 && unsafeFiles.length === 0;
  return h('footer', { class: 'pending-panel__footer' },
    summary.touchesProduction
      ? h('div', { class: 'notice notice--warning' },
        icon('shield-alert', { size: 18, className: 'notice__icon' }),
        h('p', null, h('strong', null, 'Production files included.'), ' Merging the pull request deploys these changes to production.'),
      )
      : null,
    unsafeFiles.length > 0
      ? h('div', { class: 'notice notice--error', role: 'alert' },
        icon('triangle-alert', { size: 18, className: 'notice__icon' }),
        h('div', { class: 'notice__body' },
          'These files are formatted in a way Config Manager would change, so they cannot be edited here:',
          h('ul', null, unsafeFiles.map((path) => h('li', null, h('code', null, path)))),
        ),
      )
      : null,
    h('p', { class: 'pending-panel__summary' },
      effective.length === 0
        ? 'Nothing to submit yet.'
        : `${plural(summary.adds, 'addition')}, ${plural(summary.updates, 'update')} across ${plural(summary.appIds.length, 'app')}.`,
    ),
    h('button', {
      type: 'button',
      class: 'btn btn--primary btn--block btn--large',
      disabled: !canSubmit,
      onClick: () => dialogs.createPullRequest(),
    }, icon('git-pull-request', { size: 18 }), 'Generate Pull Request'),
    state.pending.length > 0
      ? h('button', {
        type: 'button',
        class: 'btn btn--ghost btn--block',
        onClick: () => {
          if (window.confirm('Discard all pending changes?')) controller.clearPending();
        },
      }, icon('trash', { size: 16 }), 'Clear all')
      : null,
  );
}

/** Everything staged but not yet submitted, grouped by file, with the old and new text side by side. */
export function renderPendingPanel(state, context) {
  const { controller } = context;
  return h('aside', { id: 'pending-panel', class: 'pending-panel', tabindex: '-1', 'aria-labelledby': 'pending-title' },
    h('header', { class: 'pending-panel__header' },
      h('h2', { id: 'pending-title', class: 'pending-panel__title' },
        icon('git-pull-request', { size: 18, className: 'pending-panel__title-icon' }),
        'Pending changes',
      ),
      badge(String(state.pending.length), state.pending.length > 0 ? 'pending' : 'info'),
    ),
    state.pending.length === 0
      ? renderEmpty()
      : h('div', { class: 'pending-panel__body' }, groupByFileKey(state.resolved).map((changes) => renderGroup(changes, controller))),
    renderFooter(state, context),
  );
}
