import { APPS, makeFileKey } from '../../app/AppRegistry.js';
import { SEVERITY, SEVERITY_RANK } from '../../analysis/IssueTypes.js';
import { CHANGE_KIND } from '../../changes/ChangeSet.js';
import { appAvatar } from '../appTheme.js';
import { badge, countBySeverity } from '../badges.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const DOTS = 18;

/** Strings whose worst problem is an error, a warning, or neither (info does not count against a string). */
function severityBreakdown(issues, total) {
  const worst = new Map();
  for (const issue of issues) {
    if (issue.severity === SEVERITY.INFO) continue;
    const current = worst.get(issue.key);
    if (!current || SEVERITY_RANK[issue.severity] > SEVERITY_RANK[current]) worst.set(issue.key, issue.severity);
  }
  const errors = [...worst.values()].filter((severity) => severity === SEVERITY.ERROR).length;
  const warnings = worst.size - errors;
  return { errors, warnings, clean: Math.max(0, total - worst.size) };
}

/**
 * A 2-row dot-matrix + proportional bar showing clean vs warned vs errored strings,
 * inspired by the reference bento dashboard's dot-grid indicators.
 */
function healthBar({ errors, warnings, clean }, total) {
  const segment = (kind, count, label) =>
    count > 0
      ? h('span', { class: `health__segment health__segment--${kind}`, style: { 'flex-grow': count }, title: `${count.toLocaleString()} ${label}` })
      : null;

  const errorDots = total > 0 && errors > 0 ? Math.max(1, Math.round((errors / total) * DOTS)) : 0;
  const warningDots = total > 0 && warnings > 0 ? Math.min(DOTS - errorDots, Math.max(1, Math.round((warnings / total) * DOTS))) : 0;
  const okDots = Math.max(0, DOTS - errorDots - warningDots);
  const dotKinds = [
    ...Array.from({ length: errorDots }, () => 'error'),
    ...Array.from({ length: warningDots }, () => 'warning'),
    ...Array.from({ length: okDots }, () => 'ok'),
  ];

  return h('div', {
    class: 'health-wrap',
    role: 'img',
    'aria-label': `${total.toLocaleString()} strings: ${errors} with errors, ${warnings} with warnings, ${clean} clean`,
  },
  h('div', { class: 'health-dots', 'aria-hidden': 'true' },
    dotKinds.map((kind) => h('span', { class: `health-dots__dot health-dots__dot--${kind}` })),
  ),
  h('div', { class: 'health', 'aria-hidden': 'true' },
    segment('error', errors, 'with errors'),
    segment('warning', warnings, 'with warnings'),
    segment('ok', clean, 'clean'),
  ));
}

function renderCard({ app, catalog, issues, pendingCount }) {
  const counts = countBySeverity(issues);
  const total = catalog?.size ?? 0;
  return h('article', { class: `summary-card app--${app.id}` },
    h('div', { class: 'summary-card__inner' },
      h('header', { class: 'summary-card__header' },
        appAvatar(app),
        h('div', { class: 'summary-card__titles' },
          h('h3', { class: 'summary-card__title' }, app.label),
        ),
        h('span', { class: 'summary-card__locale' }, app.locale),
      ),
      catalog
        ? h('div', { class: 'summary-card__metric' },
          h('div', { class: 'summary-card__numbers' },
            h('span', { class: 'summary-card__caption' }, 'Total strings'),
            h('p', { class: 'summary-card__count' }, h('strong', null, total.toLocaleString()), h('span', null, 'strings')),
          ),
          healthBar(severityBreakdown(issues, total), total),
        )
        : h('p', { class: 'summary-card__unavailable' }, icon('circle-alert', { size: 16 }), 'File unavailable'),
    ),
    catalog
      ? h('footer', { class: 'summary-card__tray' },
        h('div', { class: 'summary-card__badges' },
          counts.error > 0 ? badge(plural(counts.error, 'error'), 'error', null, 'circle-alert') : null,
          counts.warning > 0 ? badge(plural(counts.warning, 'warning'), 'warning', null, 'triangle-alert') : null,
          counts.info > 0 ? badge(`${counts.info} info`, 'info') : null,
          issues.length === 0 ? badge('No issues', 'success', null, 'circle-check') : null,
          pendingCount > 0 ? badge(`${pendingCount} pending`, 'pending', null, 'pencil') : null,
        ),
        catalog.htmlUrl
          ? h('a', { class: 'summary-card__link', href: catalog.htmlUrl, target: '_blank', rel: 'noopener noreferrer' },
            h('span', { class: 'summary-card__link-orb', 'aria-hidden': 'true' }, icon('arrow-up-right', { size: 12 })),
            'View file on GitHub')
          : null,
      )
      : null,
  );
}

/** One card per app for the selected environment: size, health, issue counts and pending edits. */
export function renderSummaryCards(state) {
  const envId = state.preferences.environment;
  const hidden = new Set(state.preferences.hiddenIssueTypes);
  const environmentIssues = state.issueIndex.forEnvironment(envId);
  return h('div', { class: 'summary-cards' },
    APPS.map((app) => {
      const fileKey = makeFileKey(app.id, envId);
      return renderCard({
        app,
        catalog: state.effectiveCatalogs.get(fileKey) ?? null,
        issues: environmentIssues.filter((issue) => issue.appId === app.id && !hidden.has(issue.type)),
        pendingCount: state.resolved.filter(
          (change) => change.fileKey === fileKey && (change.kind === CHANGE_KIND.ADD || change.kind === CHANGE_KIND.UPDATE),
        ).length,
      });
    }),
  );
}
