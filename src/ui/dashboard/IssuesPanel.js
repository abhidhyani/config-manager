import { getApp } from '../../app/AppRegistry.js';
import { ISSUE_TYPES, SEVERITY_RANK } from '../../analysis/IssueTypes.js';
import { appDot } from '../appTheme.js';
import { SEVERITY_ICONS, SEVERITY_LABELS } from '../badges.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { renderKey } from '../valueRenderer.js';

const INITIAL_ISSUES_PER_GROUP = 100;

function groupByType(issues) {
  const groups = new Map();
  for (const issue of issues) groups.set(issue.type, [...(groups.get(issue.type) ?? []), issue]);
  return [...groups]
    .map(([type, items]) => ({ type, items, severity: items[0].severity, ...ISSUE_TYPES[type] }))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.items.length - a.items.length);
}

/**
 * Every issue in the selected environment, grouped by kind, most severe first.
 * Remembers which groups the user opened or expanded across re-renders.
 */
export class IssuesPanel {
  #controller;
  #requestRender;
  #closed = new Set();
  #expanded = new Set();

  constructor({ controller, requestRender }) {
    this.#controller = controller;
    this.#requestRender = requestRender;
  }

  render(state) {
    const envId = state.preferences.environment;
    const hidden = new Set(state.preferences.hiddenIssueTypes);
    const issues = state.issueIndex.forEnvironment(envId).filter((issue) => !hidden.has(issue.type));
    if (issues.length === 0) {
      return h('div', { class: 'empty-state empty-state--ok' },
        h('span', { class: 'empty-state__icon' }, icon('circle-check', { size: 28 })),
        h('h3', { class: 'empty-state__title' }, 'No issues to show'),
        h('p', null, hidden.size > 0
          ? 'Everything left is hidden by the Issue types menu above.'
          : 'The three apps are consistent in this environment.'),
      );
    }
    return h('div', { class: 'issue-groups' }, groupByType(issues).map((group) => this.#renderGroup(group)));
  }

  #renderGroup(group) {
    const showAll = this.#expanded.has(group.type);
    const visible = showAll ? group.items : group.items.slice(0, INITIAL_ISSUES_PER_GROUP);
    return h('details', {
      class: `issue-group issue-group--${group.severity}`,
      open: !this.#closed.has(group.type),
      onToggle: (event) => {
        if (event.target.open) this.#closed.delete(group.type);
        else this.#closed.add(group.type);
      },
    },
    h('summary', { class: 'issue-group__summary' },
      icon(SEVERITY_ICONS[group.severity], { size: 18, className: 'issue-group__icon' }),
      h('span', { class: 'issue-group__title' }, group.label),
      h('span', { class: 'issue-group__severity' }, SEVERITY_LABELS[group.severity]),
      h('span', { class: 'issue-group__count' }, group.items.length.toLocaleString()),
      icon('chevron-down', { size: 16, className: 'issue-group__chevron' }),
    ),
    h('ul', { class: 'issue-list' }, visible.map((issue) => this.#renderIssue(issue))),
    group.items.length > visible.length
      ? h('button', {
        type: 'button',
        class: 'btn btn--small issue-group__more',
        onClick: () => {
          this.#expanded.add(group.type);
          this.#requestRender();
        },
      }, `Show all ${group.items.length.toLocaleString()}`)
      : null,
    );
  }

  #renderIssue(issue) {
    const app = getApp(issue.appId);
    return h('li', { class: 'issue' },
      h('span', { class: 'issue__app' }, app ? appDot(app) : null, app?.shortLabel ?? issue.appId),
      h('button', {
        type: 'button',
        class: 'link-button issue__key',
        title: 'Show this string in the Strings tab',
        onClick: () => this.#showInStrings(issue.key),
      }, renderKey(issue.key)),
      h('span', { class: 'issue__message' }, issue.message),
    );
  }

  #showInStrings(key) {
    this.#controller.setStatusFilter('all');
    this.#controller.setDashboardTab('strings');
    this.#controller.setSearch(key);
  }
}
