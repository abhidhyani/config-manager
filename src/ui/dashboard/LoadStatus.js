import { getEnvironment } from '../../app/AppRegistry.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';

const externalLink = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text, icon('external-link', { size: 12, className: 'link-icon' }));

const formatTime = (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Editorial overview strip (inspired by the reference dashboard's top summary row):
 * environment badge, repository metadata, quick actions on the left; headline and live tally on the right.
 */
export function renderPageHeader(state, { controller, dialogs, keyCount = 0, issueCount = 0 }) {
  const { load, settings } = state;
  const environment = getEnvironment(state.preferences.environment);
  const refreshing = load.status === 'loading';
  const pendingCount = state.pending.length;
  const subtitle = pendingCount > 0
    ? `${keyCount.toLocaleString()} keys \u00B7 ${pendingCount} staged for PR`
    : issueCount > 0
      ? `${keyCount.toLocaleString()} keys \u00B7 ${issueCount.toLocaleString()} ${issueCount === 1 ? 'issue' : 'issues'} to review`
      : `${keyCount.toLocaleString()} keys across 3 apps`;

  return h('div', { class: 'page-header' },
    h('div', { class: 'page-header__left' },
      h('div', {
        class: `env-orb${environment.isProduction ? ' is-production' : ''}`,
        title: `${environment.label} environment`,
      },
      h('span', { class: 'env-orb__code' }, environment.shortLabel),
      h('span', { class: 'env-orb__dot', 'aria-hidden': 'true' })),
      h('div', { class: 'page-header__meta' },
        h('p', { class: 'source' },
          icon('git-branch', { size: 14 }),
          h('code', null, settings.repository),
          h('span', { class: 'source__pill' }, settings.branch),
          load.commitSha
            ? externalLink(`https://github.com/${settings.repository}/commit/${load.commitSha}`, load.commitSha.slice(0, 7))
            : null,
        ),
        h('p', { class: 'source__sub' },
          h('span', { class: `env-tag${environment.isProduction ? ' is-production' : ''}` }, environment.label),
          load.loadedAt ? h('span', { class: 'source__time' }, icon('clock', { size: 12 }), `Loaded ${formatTime(load.loadedAt)}`) : null,
        ),
      ),
      h('span', { class: 'page-header__divider', 'aria-hidden': 'true' }),
      h('div', { class: 'page-header__actions' },
        dialogs
          ? h('button', {
            type: 'button',
            class: 'btn btn--accent',
            onClick: () => dialogs.addString({}),
          }, 'Add string', icon('arrow-right', { size: 16 }))
          : null,
        h('button', {
          type: 'button',
          class: `btn btn--circle${refreshing ? ' is-spinning' : ''}`,
          disabled: refreshing,
          'aria-label': 'Refresh from GitHub',
          title: refreshing ? 'Refreshing\u2026' : 'Refresh from GitHub',
          'data-focus-id': 'refresh',
          onClick: () => controller.loadData(),
        }, icon('refresh', { size: 16, className: 'btn__spin' }), h('span', { class: 'visually-hidden' }, refreshing ? 'Refreshing\u2026' : 'Refresh')),
      ),
    ),
    h('div', { class: 'page-header__text' },
      h('h2', { class: 'page-title' }, 'Strings overview'),
      h('p', { class: 'page-subtitle' }, subtitle),
    ),
  );
}

/** A constant reminder, while viewing Prod, that these files ship to the live apps. */
export function renderProductionBanner(state) {
  if (!getEnvironment(state.preferences.environment)?.isProduction) return null;
  return h('div', { class: 'prod-banner', role: 'note' },
    h('span', { class: 'prod-banner__icon' }, icon('shield-alert', { size: 16 })),
    h('p', null, h('strong', null, 'You are viewing Production.'), ' Changes merged from here ship to the live apps.'),
  );
}

function step(number, text) {
  return h('li', { class: 'hero__step' }, h('span', { class: 'hero__step-number' }, number), text);
}

export function renderConnectPrompt({ controller, hasToken }) {
  return h('div', { class: 'hero' },
    h('span', { class: 'hero__icon' }, icon(hasToken ? 'sliders' : 'key', { size: 24 })),
    h('h2', { class: 'hero__title' }, hasToken ? 'Review your settings' : 'Connect to GitHub'),
    h('p', { class: 'hero__text' }, hasToken
      ? 'The saved repository settings are not valid, so nothing has been loaded. Open Settings to fix them.'
      : 'Add a personal access token in Settings to load the string files for FOX One USA, FOX One Mexico and FOX Nation.'),
    h('button', { type: 'button', class: 'btn btn--accent btn--large', onClick: () => controller.setView('settings') },
      'Open Settings', icon('arrow-right', { size: 17 })),
    hasToken ? null : h('ol', { class: 'hero__steps' },
      step(1, 'Add a GitHub token'),
      step(2, 'Compare the three apps side by side'),
      step(3, 'Edit strings and open a pull request'),
    ),
  );
}

function skeletonCard() {
  return h('div', { class: 'skeleton-card' },
    h('div', { class: 'skeleton-card__inner' },
      h('div', { class: 'skeleton skeleton--line skeleton--short' }),
      h('div', { class: 'skeleton skeleton--big' }),
      h('div', { class: 'skeleton skeleton--bar' }),
    ),
    h('div', { class: 'skeleton skeleton--line skeleton--short' }),
  );
}

export function renderLoading() {
  return h('div', { class: 'dashboard is-entering', role: 'status' },
    h('p', { class: 'visually-hidden' }, 'Loading strings from GitHub\u2026'),
    h('div', { class: 'summary-cards' }, skeletonCard(), skeletonCard(), skeletonCard()),
    h('div', { class: 'skeleton-table' },
      Array.from({ length: 7 }, () => h('div', { class: 'skeleton skeleton--row' })),
    ),
  );
}

export function renderLoadError(state, { controller }) {
  const { error } = state.load;
  return h('div', { class: 'hero hero--error', role: 'alert' },
    h('span', { class: 'hero__icon' }, icon('circle-alert', { size: 24 })),
    h('h2', { class: 'hero__title' }, 'Could not load strings'),
    h('p', { class: 'hero__text' }, error.message),
    error.ssoUrl ? h('p', null, externalLink(error.ssoUrl, 'Authorize this token for the organization')) : null,
    h('div', { class: 'button-row' },
      h('button', { type: 'button', class: 'btn btn--accent', onClick: () => controller.loadData() }, icon('refresh', { size: 16 }), 'Try again'),
      h('button', { type: 'button', class: 'btn', onClick: () => controller.setView('settings') }, icon('sliders', { size: 16 }), 'Open Settings'),
    ),
  );
}

/** Files that could not be read; the rest of the dashboard still works around them. */
export function renderFailureNotice(failures) {
  if (failures.length === 0) return null;
  return h('div', { class: 'notice notice--error', role: 'alert' },
    icon('triangle-alert', { size: 18, className: 'notice__icon' }),
    h('div', { class: 'notice__body' },
      h('strong', null, `${failures.length} of 6 files could not be loaded`),
      h('ul', null, failures.map((failure) => h('li', null, h('code', null, failure.target.path), ` \u2014 ${failure.message}`))),
    ),
  );
}
