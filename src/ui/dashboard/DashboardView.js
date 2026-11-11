import { APPS, makeFileKey } from '../../app/AppRegistry.js';
import { buildMatrix } from '../../analysis/buildMatrix.js';
import { filterRows, paginate, STATUS_FILTERS } from '../../analysis/filterRows.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { renderFilterBar } from './FilterBar.js';
import { IssuesPanel } from './IssuesPanel.js';
import { IssueTypeMenu } from './IssueTypeMenu.js';
import {
  renderConnectPrompt,
  renderFailureNotice,
  renderLoadError,
  renderLoading,
  renderPageHeader,
  renderProductionBanner,
} from './LoadStatus.js';
import { renderPagination } from './Pagination.js';
import { renderStringsTable } from './StringsTable.js';
import { renderSummaryCards } from './SummaryCards.js';

function tabButton({ id, label, iconName, count, selected, controller }) {
  return h('button', {
    type: 'button',
    role: 'tab',
    class: `tab${selected ? ' is-selected' : ''}`,
    'aria-selected': String(selected),
    'data-focus-id': `tab-${id}`,
    onClick: () => controller.setDashboardTab(id),
  }, icon(iconName, { size: 15 }), label, h('span', { class: 'tab__count' }, count.toLocaleString()));
}

/** Composes the loaded-data screen, and the connect / loading / error states that precede it. */
export class DashboardView {
  #controller;
  #dialogs;
  #issuesPanel;
  #issueMenu;
  #matrixInputs = null;
  #rows = [];
  #lastSceneKey = '';
  #lastPanelKey = '';

  constructor({ controller, dialogs, requestRender }) {
    this.#controller = controller;
    this.#dialogs = dialogs;
    this.#issuesPanel = new IssuesPanel({ controller, requestRender });
    this.#issueMenu = new IssueTypeMenu({ controller });
  }

  render(state) {
    const context = { controller: this.#controller, issueMenu: this.#issueMenu, dialogs: this.#dialogs };
    if (!state.hasToken || state.load.status === 'idle') {
      this.#lastSceneKey = 'connect';
      return renderConnectPrompt({ ...context, hasToken: state.hasToken });
    }
    const hasData = state.baseCatalogs.size > 0;
    if (state.load.status === 'loading' && !hasData) {
      this.#lastSceneKey = 'loading';
      return renderLoading();
    }
    if (state.load.status === 'error') {
      this.#lastSceneKey = 'error';
      return renderLoadError(state, context);
    }

    const envId = state.preferences.environment;
    const refreshing = state.load.status === 'loading';
    const rows = this.#matrixFor(state);
    const selectedTab = state.preferences.dashboardTab;
    const onStrings = selectedTab === 'strings';
    const hiddenTypes = new Set(state.preferences.hiddenIssueTypes);
    const issueCount = state.issueIndex.forEnvironment(envId).filter((issue) => !hiddenTypes.has(issue.type)).length;
    const filterOptions = { apps: APPS, search: state.search, hiddenTypes };

    const sceneKey = `ready:${envId}`;
    const animateScene = this.#lastSceneKey !== sceneKey;
    this.#lastSceneKey = sceneKey;

    const panelKey = `${envId}:${selectedTab}:${state.preferences.statusFilter}:${state.page}`;
    const animatePanel = this.#lastPanelKey !== panelKey;
    this.#lastPanelKey = panelKey;

    return h('div', { class: `dashboard${refreshing ? ' is-refreshing' : ''}${animateScene ? ' is-entering' : ''}` },
      renderPageHeader(state, { ...context, keyCount: rows.length, issueCount }),
      renderProductionBanner(state),
      renderFailureNotice(state.failures),
      renderSummaryCards(state),
      h('section', { class: 'workspace-bento', 'aria-label': 'String catalog explorer' },
        this.#renderTabBar(selectedTab, rows.length, issueCount),
        renderFilterBar(state, context, {
          includeSearch: onStrings,
          statusCounts: onStrings ? this.#statusCounts(rows, filterOptions) : {},
        }),
        h('div', { class: `workspace-bento__stage${animatePanel ? ' is-panel-entering' : ''}` },
          onStrings ? this.#renderStrings(state, rows, filterOptions) : this.#issuesPanel.render(state),
        ),
      ),
    );
  }

  /** Rebuilding 800+ rows on every keystroke elsewhere is wasteful; reuse until an input changes. */
  #matrixFor(state) {
    const envId = state.preferences.environment;
    const inputs = [state.effectiveCatalogs, state.baseCatalogs, state.issueIndex, envId];
    if (this.#matrixInputs?.every((value, index) => value === inputs[index])) return this.#rows;
    this.#matrixInputs = inputs;
    this.#rows = buildMatrix({
      envId,
      apps: APPS,
      catalogs: state.effectiveCatalogs,
      baseCatalogs: state.baseCatalogs,
      issueIndex: state.issueIndex,
      fileKeyOf: makeFileKey,
    });
    return this.#rows;
  }

  /** How many strings each status preset would show with the current search and hidden types. */
  #statusCounts(rows, filterOptions) {
    return Object.fromEntries(
      STATUS_FILTERS.map((filter) => [filter.id, filterRows(rows, { ...filterOptions, status: filter.id }).length]),
    );
  }

  #renderTabBar(selectedTab, keyCount, issueCount) {
    return h('div', { class: 'tab-bar' },
      h('div', { class: 'tab-bar__left' },
        h('span', { class: 'workspace-bento__title' }, 'Catalog explorer'),
        h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Dashboard sections' },
          tabButton({ id: 'strings', label: 'Strings', iconName: 'list', count: keyCount, selected: selectedTab === 'strings', controller: this.#controller }),
          tabButton({ id: 'issues', label: 'Issues', iconName: 'triangle-alert', count: issueCount, selected: selectedTab === 'issues', controller: this.#controller }),
        ),
      ),
      h('button', {
        type: 'button',
        class: 'btn btn--primary',
        onClick: () => this.#dialogs.addString({}),
      }, icon('plus', { size: 15 }), 'Add string'),
    );
  }

  #renderStrings(state, rows, filterOptions) {
    const filtered = filterRows(rows, { ...filterOptions, status: state.preferences.statusFilter });
    if (filtered.length === 0) {
      return h('div', { class: 'empty-state' },
        h('span', { class: 'empty-state__icon' }, icon('search', { size: 24 })),
        h('h3', { class: 'empty-state__title' }, 'No strings match'),
        h('p', null, 'Try a different search or status filter.'),
        h('button', {
          type: 'button',
          class: 'btn',
          onClick: () => {
            this.#controller.setStatusFilter('all');
            this.#controller.setSearch('');
          },
        }, 'Clear filters'),
      );
    }
    const pageSize = state.preferences.pageSize;
    const pageInfo = paginate(filtered, state.page, pageSize);
    const pagination = renderPagination({ pageInfo, total: filtered.length, pageSize }, { controller: this.#controller });
    return h('div', { class: 'strings-panel', role: 'tabpanel' },
      renderStringsTable({ rows: pageInfo.items, hiddenTypes: filterOptions.hiddenTypes, dialogs: this.#dialogs }),
      pagination,
    );
  }
}
