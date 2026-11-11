import { STATUS_FILTERS } from '../../analysis/filterRows.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';

const PILL_DOTS = Object.freeze({
  issues: 'warning',
  errors: 'error',
  missing: 'error',
  invalid: 'error',
  differs: 'warning',
  pending: 'pending',
});

function searchBox(state, controller) {
  return h('div', { class: 'search' },
    h('span', { class: 'search__orb', 'aria-hidden': 'true' }, icon('search', { size: 15, className: 'search__icon' })),
    h('label', { class: 'visually-hidden', for: 'string-search' }, 'Search keys and values'),
    h('input', {
      id: 'string-search',
      type: 'search',
      class: 'search__input',
      placeholder: 'Search keys and values\u2026',
      value: state.search,
      autocomplete: 'off',
      spellcheck: 'false',
      'data-focus-id': 'search',
      onInput: (event) => controller.setSearch(event.target.value),
    }),
  );
}

function statusPills(state, controller, statusCounts) {
  const selected = state.preferences.statusFilter;
  return h('div', { class: 'pills', role: 'group', 'aria-label': 'Show strings' },
    STATUS_FILTERS.map((filter) => {
      const count = statusCounts[filter.id] ?? 0;
      const isSelected = filter.id === selected;
      const dotTone = PILL_DOTS[filter.id];
      return h('button', {
        type: 'button',
        class: `pill${isSelected ? ' is-selected' : ''}${count === 0 && !isSelected ? ' is-empty' : ''}`,
        'aria-pressed': String(isSelected),
        'data-focus-id': `status-${filter.id}`,
        onClick: () => controller.setStatusFilter(filter.id),
      },
      dotTone && count > 0 ? h('span', { class: `pill__dot pill__dot--${dotTone}`, 'aria-hidden': 'true' }) : null,
      filter.label,
      h('span', { class: 'pill__count' }, count.toLocaleString()));
    }),
  );
}

/**
 * The toolbar above the data: search and the issue-type menu on one line, status presets with
 * live counts under them (Strings tab only; the Issues tab just needs the menu).
 */
export function renderFilterBar(state, { controller, issueMenu }, { includeSearch, statusCounts }) {
  const menu = issueMenu.render(state);
  if (!includeSearch && !menu) return null;
  return h('div', { class: 'filter-bar' },
    h('div', { class: 'filter-bar__row' },
      includeSearch ? searchBox(state, controller) : h('span', { class: 'filter-bar__spacer' }),
      menu,
    ),
    includeSearch ? statusPills(state, controller, statusCounts) : null,
  );
}
